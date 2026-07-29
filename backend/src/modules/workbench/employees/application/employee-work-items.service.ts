import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { EmployeeProgressSnapshotService } from './employee-progress-snapshot.service';

export interface UpdateEmployeeWorkItemSystemFieldsInput {
  workKind?: EmployeeWorkKind;
  projectId?: string | null;
  taskId?: string | null;
  plannedCompletionAt?: Date | null;
  plannedHours?: number | null;
  actualHours?: number | null;
  riskText?: string | null;
}

type SystemFieldsData = UpdateEmployeeWorkItemSystemFieldsInput;

const ACTIVE_WORK_ITEM_SELECT = {
  id: true,
  importBatchId: true,
  workKind: true,
  projectId: true,
  taskId: true,
  plannedCompletionAt: true,
  plannedHours: true,
  actualHours: true,
  riskText: true,
} as const satisfies Prisma.EmployeeWorkItemSelect;

type ActiveWorkItem = Prisma.EmployeeWorkItemGetPayload<{
  select: typeof ACTIVE_WORK_ITEM_SELECT;
}>;

@Injectable()
export class EmployeeWorkItemsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly audit: AuditLogService,
    private readonly snapshots: EmployeeProgressSnapshotService,
  ) {}

  async updateSystemFields(
    workItemId: string,
    input: UpdateEmployeeWorkItemSystemFieldsInput,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:employee-work-item:${workItemId}`}))`,
      );
      const item = await tx.employeeWorkItem.findFirst({
        where: {
          id: workItemId,
          archivedAt: null,
          employee: { archivedAt: null },
          importBatch: {
            periodType: EmployeeProgressPeriod.WEEK,
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
          },
        },
        select: ACTIVE_WORK_ITEM_SELECT,
      });
      if (!item) {
        throw new AppError({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: 'Employee work item not found',
          statusCode: HttpStatus.NOT_FOUND,
        });
      }

      const workKind = input.workKind ?? item.workKind;
      const data = this.systemFieldsData(input, workKind);
      if (workKind === EmployeeWorkKind.PROJECT) {
        await this.assertProjectReferences(
          tx,
          input.projectId !== undefined ? input.projectId : item.projectId,
          input.taskId !== undefined ? input.taskId : item.taskId,
        );
      }
      const changedFields = this.changedFields(item, data);
      const updated = await tx.employeeWorkItem.update({
        where: { id: workItemId },
        data,
      });
      await this.audit.record(
        {
          action: 'EMPLOYEE_WORK_ITEM_SYSTEM_FIELDS_UPDATED',
          entityType: 'employeeWorkItem',
          entityId: workItemId,
          outcome: 'SUCCEEDED',
          changedFields,
          metadata: {
            status: changedFields.length ? 'UPDATED' : 'UNCHANGED',
            importBatchId: item.importBatchId,
          },
        },
        tx,
      );
      return { updated, importBatchId: item.importBatchId };
    });
    await this.snapshots.rebuildBatch(result.importBatchId);
    return result.updated;
  }

  private systemFieldsData(
    input: UpdateEmployeeWorkItemSystemFieldsInput,
    workKind: EmployeeWorkKind | null,
  ): SystemFieldsData {
    const common = {
      ...(input.workKind !== undefined ? { workKind: input.workKind } : {}),
      ...(input.plannedCompletionAt !== undefined
        ? { plannedCompletionAt: input.plannedCompletionAt }
        : {}),
      ...(input.plannedHours !== undefined ? { plannedHours: input.plannedHours } : {}),
      ...(input.actualHours !== undefined ? { actualHours: input.actualHours } : {}),
      ...(input.riskText !== undefined ? { riskText: input.riskText } : {}),
    };
    if (workKind === EmployeeWorkKind.NON_PROJECT) {
      return { ...common, projectId: null, taskId: null };
    }
    return {
      ...common,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    };
  }

  private async assertProjectReferences(
    tx: Prisma.TransactionClient,
    projectId: string | null | undefined,
    taskId: string | null | undefined,
  ) {
    if (!projectId) {
      throw new AppError({
        code: ErrorCodes.PROJECT_NOT_FOUND,
        message: 'Project employee work item must reference an active project',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    const project = await tx.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppError({
        code: ErrorCodes.PROJECT_NOT_FOUND,
        message: 'Employee work item project not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    if (!taskId) return;
    const task = await tx.workTask.findFirst({
      where: { id: taskId, projectId, archivedAt: null },
      select: { id: true },
    });
    if (!task) {
      throw new AppError({
        code: ErrorCodes.TASK_INVALID_REFERENCE,
        message: 'Employee work item task must belong to the selected active project',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private changedFields(item: ActiveWorkItem, data: SystemFieldsData) {
    const changed = new Set<string>();
    if (data.workKind !== undefined && data.workKind !== item.workKind) changed.add('workKind');
    if (
      data.plannedCompletionAt !== undefined &&
      data.plannedCompletionAt?.getTime() !== item.plannedCompletionAt?.getTime()
    ) {
      changed.add('plannedCompletionAt');
    }
    if (
      data.plannedHours !== undefined &&
      this.number(data.plannedHours) !== this.number(item.plannedHours)
    ) {
      changed.add('plannedHours');
    }
    if (
      data.actualHours !== undefined &&
      this.number(data.actualHours) !== this.number(item.actualHours)
    ) {
      changed.add('actualHours');
    }
    if (data.riskText !== undefined && data.riskText !== item.riskText) changed.add('riskText');
    if (data.projectId !== undefined && data.projectId !== item.projectId) changed.add('projectId');
    if (data.taskId !== undefined && data.taskId !== item.taskId) changed.add('taskId');
    return [...changed].sort();
  }

  private number(value: Prisma.Decimal | number | null | undefined) {
    return value === null || value === undefined ? null : Number(value);
  }
}
