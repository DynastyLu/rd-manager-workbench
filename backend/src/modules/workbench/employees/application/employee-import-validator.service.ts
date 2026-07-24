import { Injectable } from '@nestjs/common';
import { EmployeeImportRowStatus, EmploymentStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { NormalizedEmployeeWorkRow } from '../domain/employee-work.types';

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
  ): Promise<ValidatedEmployeeImportRow[]> {
    const employeeNames = this.unique(rows.map(({ employeeName }) => employeeName));
    const projectCodes = this.unique(
      rows.flatMap(({ projectCode }) => (projectCode ? [projectCode] : [])),
    );
    const taskCodes = this.unique(rows.flatMap(({ taskCode }) => (taskCode ? [taskCode] : [])));
    const resolutionValues = [...resolutions.values()];
    const employeeIds = this.unique(
      resolutionValues.flatMap(({ employeeId }) => (employeeId ? [employeeId] : [])),
    );
    const projectIds = this.unique(
      resolutionValues.flatMap(({ projectId }) => (projectId ? [projectId] : [])),
    );
    const taskIds = this.unique(resolutionValues.flatMap(({ taskId }) => (taskId ? [taskId] : [])));

    const [employees, projects, tasks] = await Promise.all([
      this.prisma.resourceProfile.findMany({
        where: {
          archivedAt: null,
          employmentStatus: { not: EmploymentStatus.LEFT },
          OR: [{ displayName: { in: employeeNames } }, { id: { in: employeeIds } }],
        },
        select: { id: true, displayName: true },
      }),
      this.prisma.project.findMany({
        where: {
          archivedAt: null,
          OR: [{ code: { in: projectCodes } }, { id: { in: projectIds } }],
        },
        select: { id: true, code: true },
      }),
      this.prisma.workTask.findMany({
        where: {
          archivedAt: null,
          OR: [{ code: { in: taskCodes } }, { id: { in: taskIds } }],
        },
        select: { id: true, code: true, projectId: true },
      }),
    ]);

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
}
