import { Injectable } from '@nestjs/common';
import { EmployeeImportRowStatus, EmploymentStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { NormalizedEmployeeWorkRow } from '../domain/employee-work.types';

const VALIDATION_QUERY_CHUNK_SIZE = 1_000;

export type EmployeeImportReferenceErrorCode =
  | 'EMPLOYEE_NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'TASK_PROJECT_MISMATCH';

export interface EmployeeImportReferenceError {
  field: '员工姓名' | '项目编号' | '任务编号';
  code: EmployeeImportReferenceErrorCode;
  rawValue: string | null;
  reason: string;
}

export interface EmployeeImportResolution {
  employeeId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  keepUnlinked?: boolean;
}

export interface ValidatedEmployeeImportRow {
  row: NormalizedEmployeeWorkRow;
  status: EmployeeImportRowStatus;
  errors: EmployeeImportReferenceError[];
  resolvedEmployeeId: string | null;
  resolvedProjectId: string | null;
  resolvedTaskId: string | null;
  keepUnlinked: boolean;
}

@Injectable()
export class EmployeeImportValidatorService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async validate(
    rows: NormalizedEmployeeWorkRow[],
    resolutions: ReadonlyMap<number, EmployeeImportResolution> = new Map(),
    client: Pick<Prisma.TransactionClient, 'resourceProfile' | 'project' | 'workTask'> = this
      .prisma,
  ): Promise<ValidatedEmployeeImportRow[]> {
    const employeeNames = this.unique(
      rows.flatMap((row) =>
        resolutions.get(row.rowNumber)?.employeeId === undefined ? [row.employeeName] : [],
      ),
    );
    const projectCodes = this.unique(
      rows.flatMap((row) => {
        const resolution = resolutions.get(row.rowNumber);
        return !resolution?.keepUnlinked && resolution?.projectId === undefined && row.projectCode
          ? [row.projectCode]
          : [];
      }),
    );
    const taskCodes = this.unique(
      rows.flatMap((row) =>
        resolutions.get(row.rowNumber)?.taskId === undefined && row.taskCode ? [row.taskCode] : [],
      ),
    );
    const resolutionValues = [...resolutions.values()];
    const employeeIds = this.unique(
      resolutionValues.flatMap(({ employeeId }) => (employeeId ? [employeeId] : [])),
    );
    const projectIds = this.unique(
      resolutionValues.flatMap(({ projectId }) => (projectId ? [projectId] : [])),
    );
    const taskIds = this.unique(resolutionValues.flatMap(({ taskId }) => (taskId ? [taskId] : [])));

    const [
      employeesByNameResult,
      employeesByIdResult,
      projectsByCodeResult,
      projectsByIdResult,
      tasksByCodeResult,
      tasksByIdResult,
    ] = await Promise.all([
      this.queryChunks(employeeNames, (chunk) =>
        client.resourceProfile.findMany({
          where: {
            archivedAt: null,
            employmentStatus: { not: EmploymentStatus.LEFT },
            displayName: { in: chunk },
          },
          select: { id: true, displayName: true },
        }),
      ),
      this.queryChunks(employeeIds, (chunk) =>
        client.resourceProfile.findMany({
          where: {
            archivedAt: null,
            employmentStatus: { not: EmploymentStatus.LEFT },
            id: { in: chunk },
          },
          select: { id: true, displayName: true },
        }),
      ),
      this.queryChunks(projectCodes, (chunk) =>
        client.project.findMany({
          where: { archivedAt: null, code: { in: chunk } },
          select: { id: true, code: true },
        }),
      ),
      this.queryChunks(projectIds, (chunk) =>
        client.project.findMany({
          where: { archivedAt: null, id: { in: chunk } },
          select: { id: true, code: true },
        }),
      ),
      this.queryChunks(taskCodes, (chunk) =>
        client.workTask.findMany({
          where: { archivedAt: null, code: { in: chunk } },
          select: { id: true, code: true, projectId: true },
        }),
      ),
      this.queryChunks(taskIds, (chunk) =>
        client.workTask.findMany({
          where: { archivedAt: null, id: { in: chunk } },
          select: { id: true, code: true, projectId: true },
        }),
      ),
    ]);
    const employees = this.uniqueById([...employeesByNameResult, ...employeesByIdResult]);
    const projects = this.uniqueById([...projectsByCodeResult, ...projectsByIdResult]);
    const tasks = this.uniqueById([...tasksByCodeResult, ...tasksByIdResult]);

    const employeesByName = new Map(employees.map((employee) => [employee.displayName, employee]));
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
    const projectsByCode = new Map(projects.map((project) => [project.code, project]));
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const tasksByCode = new Map(tasks.map((task) => [task.code, task]));
    const tasksById = new Map(tasks.map((task) => [task.id, task]));

    return rows.map((row) => {
      const resolution = resolutions.get(row.rowNumber);
      const errors: EmployeeImportReferenceError[] = [];
      const employee =
        resolution?.employeeId !== undefined
          ? resolution.employeeId
            ? employeesById.get(resolution.employeeId)
            : undefined
          : employeesByName.get(row.employeeName);
      if (!employee) {
        errors.push({
          field: '员工姓名',
          code: 'EMPLOYEE_NOT_FOUND',
          rawValue: row.employeeName,
          reason: 'employee must exactly match an active employee',
        });
      }

      const keepUnlinked = resolution?.keepUnlinked === true;
      const project = keepUnlinked
        ? undefined
        : resolution?.projectId !== undefined
          ? resolution.projectId
            ? projectsById.get(resolution.projectId)
            : undefined
          : row.projectCode
            ? projectsByCode.get(row.projectCode)
            : undefined;
      const projectRequested =
        !keepUnlinked &&
        (row.projectCode !== null ||
          (resolution?.projectId !== undefined && resolution.projectId !== null));
      if (projectRequested && !project) {
        errors.push({
          field: '项目编号',
          code: 'PROJECT_NOT_FOUND',
          rawValue: row.projectCode,
          reason: 'project must exactly match an active project',
        });
      }

      const task =
        resolution?.taskId !== undefined
          ? resolution.taskId
            ? tasksById.get(resolution.taskId)
            : undefined
          : row.taskCode
            ? tasksByCode.get(row.taskCode)
            : undefined;
      const taskRequested =
        resolution?.taskId !== undefined ? resolution.taskId !== null : row.taskCode !== null;
      if (taskRequested && !task) {
        errors.push({
          field: '任务编号',
          code: 'TASK_NOT_FOUND',
          rawValue: row.taskCode,
          reason: 'task must exactly match an active task',
        });
      } else if (task && (!project || task.projectId !== project.id)) {
        errors.push({
          field: '任务编号',
          code: 'TASK_PROJECT_MISMATCH',
          rawValue: row.taskCode,
          reason: 'task must belong to the resolved project',
        });
      }

      return {
        row,
        status:
          errors.length === 0 ? EmployeeImportRowStatus.VALID : EmployeeImportRowStatus.UNRESOLVED,
        errors,
        resolvedEmployeeId: employee?.id ?? null,
        resolvedProjectId: project?.id ?? null,
        resolvedTaskId: task?.id ?? null,
        keepUnlinked,
      };
    });
  }

  private unique(values: string[]): string[] {
    return [...new Set(values)];
  }

  private uniqueById<T extends { id: string }>(values: T[]): T[] {
    return [...new Map(values.map((value) => [value.id, value])).values()];
  }

  private async queryChunks<T>(
    values: string[],
    query: (chunk: string[]) => Promise<T[]>,
  ): Promise<T[]> {
    const result: T[] = [];
    for (let offset = 0; offset < values.length; offset += VALIDATION_QUERY_CHUNK_SIZE) {
      result.push(...(await query(values.slice(offset, offset + VALIDATION_QUERY_CHUNK_SIZE))));
    }
    return result;
  }
}
