import { Injectable } from '@nestjs/common';
import {
  EmployeeImportRowStatus,
  EmployeeWorkKind,
  EmploymentStatus,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import {
  NormalizedEmployeeCurrentWorkRow,
  NormalizedEmployeeWorkbookRow,
} from '../domain/employee-work.types';

const VALIDATION_QUERY_CHUNK_SIZE = 1_000;

export type EmployeeImportReferenceErrorCode =
  | 'EMPLOYEE_NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_REQUIRED'
  | 'TASK_NOT_FOUND'
  | 'TASK_PROJECT_MISMATCH'
  | 'WORK_KIND_REQUIRED'
  | 'NON_PROJECT_LINK_FORBIDDEN'
  | 'ACTUAL_HOURS_NOT_ALLOWED'
  | 'RISK_TEXT_REQUIRED';

export interface EmployeeImportReferenceError {
  field: '员工姓名' | '工作类型' | '项目编号' | '任务编号' | '实际工时' | '风险候选';
  code: EmployeeImportReferenceErrorCode;
  rawValue: string | number | null;
  reason: string;
}

export interface EmployeeImportResolution {
  employeeId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  keepUnlinked?: boolean;
  workKind?: EmployeeWorkKind | null;
  plannedHours?: number | null;
  actualHours?: number | null;
  profileAction?: 'KEEP' | 'CREATE' | 'UPDATE' | null;
  riskDecision?: 'KEEP' | 'REMOVE' | 'EDIT' | null;
  riskText?: string | null;
}

export interface EmployeeImportProfileWarning {
  field: 'department' | 'workDirection';
  profileValue: string | null;
  rowValue: string | null;
  reason: string;
}

export interface ValidatedEmployeeImportRow {
  row: NormalizedEmployeeWorkbookRow;
  status: EmployeeImportRowStatus;
  errors: EmployeeImportReferenceError[];
  resolvedEmployeeId: string | null;
  resolvedProjectId: string | null;
  resolvedTaskId: string | null;
  keepUnlinked: boolean;
  workKind: EmployeeWorkKind | null;
  plannedHours: number | null;
  actualHours: number | null;
  profileAction: 'KEEP' | 'CREATE' | 'UPDATE' | null;
  riskDecision: 'KEEP' | 'REMOVE' | 'EDIT' | null;
  riskText: string | null;
  warnings: EmployeeImportProfileWarning[];
}

@Injectable()
export class EmployeeImportValidatorService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async validate(
    rows: NormalizedEmployeeWorkbookRow[],
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
        const projectCode = this.projectCode(row);
        return !resolution?.keepUnlinked && resolution?.projectId === undefined && projectCode
          ? [projectCode]
          : [];
      }),
    );
    const taskCodes = this.unique(
      rows.flatMap((row) =>
        resolutions.get(row.rowNumber)?.taskId === undefined && this.taskCode(row)
          ? [this.taskCode(row)!]
          : [],
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
          select: { id: true, displayName: true, department: true, workDirection: true },
        }),
      ),
      this.queryChunks(employeeIds, (chunk) =>
        client.resourceProfile.findMany({
          where: {
            archivedAt: null,
            employmentStatus: { not: EmploymentStatus.LEFT },
            id: { in: chunk },
          },
          select: { id: true, displayName: true, department: true, workDirection: true },
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
      const isV2 = this.isV2(row);
      const isNextPlan = isV2 && row.sourceSection === 'NEXT_WEEK_PLAN';
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
      const warnings = employee && isV2 ? this.profileWarnings(row, employee) : [];
      const workKind = isV2 ? (resolution?.workKind ?? null) : null;
      if (isV2 && !workKind) {
        errors.push({
          field: '工作类型',
          code: 'WORK_KIND_REQUIRED',
          rawValue: null,
          reason: 'V2 rows must be classified as project or non-project work',
        });
      }

      const keepUnlinked = resolution?.keepUnlinked === true;
      const projectCode = this.projectCode(row);
      const project = keepUnlinked
        ? undefined
        : resolution?.projectId !== undefined
          ? resolution.projectId
            ? projectsById.get(resolution.projectId)
            : undefined
          : projectCode
            ? projectsByCode.get(projectCode)
            : undefined;
      const projectRequested =
        !keepUnlinked &&
        (projectCode !== null ||
          (resolution?.projectId !== undefined && resolution.projectId !== null));
      if (isV2 && workKind === EmployeeWorkKind.PROJECT && !projectRequested) {
        errors.push({
          field: '项目编号',
          code: 'PROJECT_REQUIRED',
          rawValue: null,
          reason: 'project work must resolve to an active project',
        });
      } else if (projectRequested && !project) {
        errors.push({
          field: '项目编号',
          code: 'PROJECT_NOT_FOUND',
          rawValue: projectCode,
          reason: 'project must exactly match an active project',
        });
      }

      const taskCode = this.taskCode(row);
      const task =
        resolution?.taskId !== undefined
          ? resolution.taskId
            ? tasksById.get(resolution.taskId)
            : undefined
          : taskCode
            ? tasksByCode.get(taskCode)
            : undefined;
      const taskRequested =
        resolution?.taskId !== undefined ? resolution.taskId !== null : taskCode !== null;
      if (
        isV2 &&
        workKind === EmployeeWorkKind.NON_PROJECT &&
        (projectRequested || taskRequested)
      ) {
        errors.push({
          field: projectRequested ? '项目编号' : '任务编号',
          code: 'NON_PROJECT_LINK_FORBIDDEN',
          rawValue: projectCode ?? taskCode,
          reason: 'non-project work cannot resolve to a project or task',
        });
      } else if (taskRequested && !task) {
        errors.push({
          field: '任务编号',
          code: 'TASK_NOT_FOUND',
          rawValue: taskCode,
          reason: 'task must exactly match an active task',
        });
      } else if (task && (!project || task.projectId !== project.id)) {
        errors.push({
          field: '任务编号',
          code: 'TASK_PROJECT_MISMATCH',
          rawValue: taskCode,
          reason: 'task must belong to the resolved project',
        });
      }
      const plannedHours =
        resolution?.plannedHours !== undefined
          ? resolution.plannedHours
          : 'plannedHours' in row
            ? row.plannedHours
            : null;
      const actualHours =
        resolution?.actualHours !== undefined
          ? resolution.actualHours
          : 'actualHours' in row
            ? row.actualHours
            : null;
      if (isNextPlan && actualHours !== null) {
        errors.push({
          field: '实际工时',
          code: 'ACTUAL_HOURS_NOT_ALLOWED',
          rawValue: actualHours,
          reason: 'next-week plans cannot have actual hours',
        });
      }
      const candidateRiskText =
        (!('sourceSection' in row) || row.sourceSection !== 'NEXT_WEEK_PLAN') && 'riskText' in row
          ? row.riskText
          : null;
      const riskDecision =
        isNextPlan
          ? null
          : (resolution?.riskDecision ?? (candidateRiskText ? 'KEEP' : 'REMOVE'));
      const riskText =
        riskDecision === 'REMOVE'
          ? null
          : riskDecision === 'EDIT'
            ? (resolution?.riskText ?? null)
            : candidateRiskText;
      if (riskDecision === 'EDIT' && !riskText?.trim()) {
        errors.push({
          field: '风险候选',
          code: 'RISK_TEXT_REQUIRED',
          rawValue: riskText,
          reason: 'edited risk candidates require risk text',
        });
      }

      return {
        row,
        status:
          errors.length === 0 ? EmployeeImportRowStatus.VALID : EmployeeImportRowStatus.UNRESOLVED,
        errors,
        resolvedEmployeeId: employee?.id ?? null,
        resolvedProjectId: workKind === EmployeeWorkKind.NON_PROJECT ? null : (project?.id ?? null),
        resolvedTaskId: workKind === EmployeeWorkKind.NON_PROJECT ? null : (task?.id ?? null),
        keepUnlinked,
        workKind,
        plannedHours,
        actualHours,
        profileAction: isV2 ? (resolution?.profileAction ?? 'KEEP') : null,
        riskDecision,
        riskText,
        warnings,
      };
    });
  }

  private unique(values: string[]): string[] {
    return [...new Set(values)];
  }

  private isV2(row: NormalizedEmployeeWorkbookRow): row is Exclude<
    NormalizedEmployeeWorkbookRow,
    import('../domain/employee-work.types').NormalizedEmployeeWorkRow
  > {
    return 'sourceSection' in row;
  }

  private projectCode(row: NormalizedEmployeeWorkbookRow): string | null {
    return 'projectCode' in row ? row.projectCode : null;
  }

  private taskCode(row: NormalizedEmployeeWorkbookRow): string | null {
    return 'taskCode' in row ? row.taskCode : null;
  }

  private profileWarnings(
    row: NormalizedEmployeeCurrentWorkRow | Exclude<
      NormalizedEmployeeWorkbookRow,
      import('../domain/employee-work.types').NormalizedEmployeeWorkRow
    >,
    profile: {
      department?: string | null;
      workDirection?: string | null;
    },
  ): EmployeeImportProfileWarning[] {
    return (['department', 'workDirection'] as const).flatMap((field) => {
      const profileValue = profile[field] ?? null;
      const rowValue = row[field] ?? null;
      return profileValue === rowValue
        ? []
        : [
            {
              field,
              profileValue,
              rowValue,
              reason: `${field} differs from the active employee profile`,
            },
          ];
    });
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
