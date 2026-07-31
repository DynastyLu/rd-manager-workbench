import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  Prisma,
  TaskPriority,
} from '@prisma/client';
import { DataScopeService } from '../../../../modules/iam/application/data-scope.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { TasksService } from '../../tasks/application/tasks.service';
import { acquireReminderSchedulingLock } from '../../notifications/application/reminder-scheduling-lock';
import { EmployeeProgressSnapshotService } from './employee-progress-snapshot.service';

const ACTIVE_PLAN_INCLUDE = {
  employee: {
    select: {
      id: true,
      displayName: true,
      archivedAt: true,
    },
  },
  importBatch: {
    select: {
      id: true,
      version: true,
      periodType: true,
      status: true,
      archivedAt: true,
    },
  },
  sourceRow: true,
  project: true,
  task: true,
  matchedWorkItem: true,
} as const satisfies Prisma.EmployeeWeekPlanItemInclude;

const ACTIVE_PLAN_WHERE = {
  archivedAt: null,
  employee: { archivedAt: null },
  importBatch: {
    periodType: EmployeeProgressPeriod.WEEK,
    status: EmployeeWorkImportStatus.COMPLETED,
    archivedAt: null,
  },
} as const satisfies Prisma.EmployeeWeekPlanItemWhereInput;

export interface UpdateEmployeeWeekPlanSystemFieldsInput {
  workKind?: EmployeeWorkKind;
  projectId?: string | null;
  taskId?: string | null;
  plannedCompletionAt?: Date | null;
  priority?: EmployeePlanPriority;
  collaborationText?: string | null;
}

interface SystemFieldsData {
  workKind?: EmployeeWorkKind;
  projectId?: string | null;
  taskId?: string | null;
  plannedCompletionAt?: Date | null;
  priority?: EmployeePlanPriority;
  collaborationText?: string | null;
}

type ActivePlan = Prisma.EmployeeWeekPlanItemGetPayload<{
  include: typeof ACTIVE_PLAN_INCLUDE;
}>;

@Injectable()
export class EmployeeWeekPlansService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly tasks: TasksService,
    private readonly audit: AuditLogService,
    private readonly snapshots: EmployeeProgressSnapshotService,
    private readonly dataScope: DataScopeService,
    private readonly requestContext: RequestContextService,
  ) {}

  async get(planId: string) {
    const plan = await this.prisma.employeeWeekPlanItem.findFirst({
      where: { id: planId, ...ACTIVE_PLAN_WHERE },
      include: ACTIVE_PLAN_INCLUDE,
    });
    if (!plan) throw this.planNotFound();
    return plan;
  }

  async updateSystemFields(planId: string, input: UpdateEmployeeWeekPlanSystemFieldsInput) {
    const mutation = await this.prisma.$transaction(async (tx) => {
      await this.acquireSchedulingLock(tx);
      await this.lockPlan(tx, planId);
      const plan = await this.findActivePlan(tx, planId);
      const workKind = input.workKind ?? plan.workKind;
      const data: Prisma.EmployeeWeekPlanItemUncheckedUpdateInput = {
        ...this.systemFieldsData(input, workKind),
        updatedByUserId: this.requestContext.requirePrincipal().userId,
      };

      if (workKind === EmployeeWorkKind.PROJECT) {
        await this.assertProjectReferences(
          tx,
          input.projectId !== undefined ? input.projectId : plan.projectId,
          input.taskId !== undefined ? input.taskId : plan.taskId,
        );
      }

      const changedFields = this.changedFields(plan, this.systemFieldsData(input, workKind));
      const updated = await tx.employeeWeekPlanItem.update({
        where: { id: planId },
        data,
        include: ACTIVE_PLAN_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'EMPLOYEE_WEEK_PLAN_SYSTEM_FIELDS_UPDATED',
          entityType: 'employeeWeekPlanItem',
          entityId: planId,
          outcome: 'SUCCEEDED',
          changedFields,
          metadata: {
            status: changedFields.length ? 'UPDATED' : 'UNCHANGED',
          },
        },
        tx,
      );
      return { result: updated, importBatchId: plan.importBatchId };
    });
    return this.withSnapshotResult(mutation);
  }

  async cancel(planId: string, reason: string) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw this.invalid('Cancellation reason must not be empty');
    }

    const mutation = await this.prisma.$transaction(async (tx) => {
      await this.acquireSchedulingLock(tx);
      await this.lockPlan(tx, planId);
      const plan = await this.findActivePlan(tx, planId);
      if (plan.carryStatus === EmployeePlanCarryStatus.CANCELLED) {
        await this.recordAction(
          tx,
          'EMPLOYEE_WEEK_PLAN_CANCELLED',
          planId,
          [],
          'ALREADY_CANCELLED',
          plan.carryStatus,
        );
        return {
          result: { plan, alreadyCancelled: true },
          importBatchId: plan.importBatchId,
        };
      }

      const updated = await tx.employeeWeekPlanItem.update({
        where: { id: planId },
        data: {
          carryStatus: EmployeePlanCarryStatus.CANCELLED,
          matchedWorkItemId: null,
          cancelReason: normalizedReason,
          updatedByUserId: this.requestContext.requirePrincipal().userId,
        },
        include: ACTIVE_PLAN_INCLUDE,
      });
      await this.recordAction(
        tx,
        'EMPLOYEE_WEEK_PLAN_CANCELLED',
        planId,
        ['cancelReason', 'carryStatus', ...(plan.matchedWorkItemId ? ['matchedWorkItemId'] : [])],
        EmployeePlanCarryStatus.CANCELLED,
        plan.carryStatus,
      );
      return {
        result: { plan: updated, alreadyCancelled: false },
        importBatchId: plan.importBatchId,
      };
    });
    return this.withSnapshotResult(mutation);
  }

  async match(planId: string, workItemId: string) {
    const mutation = await this.prisma.$transaction(async (tx) => {
      await this.acquireSchedulingLock(tx);
      await this.lockPlan(tx, planId);
      const plan = await this.findActivePlan(tx, planId);
      if (
        plan.carryStatus === EmployeePlanCarryStatus.MATCHED &&
        plan.matchedWorkItemId === workItemId
      ) {
        await this.recordAction(
          tx,
          'EMPLOYEE_WEEK_PLAN_MATCHED',
          planId,
          [],
          'ALREADY_MATCHED',
          plan.carryStatus,
        );
        return {
          result: { plan, alreadyMatched: true },
          importBatchId: plan.importBatchId,
        };
      }
      if (plan.carryStatus !== EmployeePlanCarryStatus.PLANNED) {
        throw this.invalid('Only a planned employee week plan can be matched', HttpStatus.CONFLICT);
      }

      await this.lockMatchTarget(tx, workItemId);
      const workItem = await tx.employeeWorkItem.findFirst({
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
        select: { id: true, employeeId: true, periodStartAt: true },
      });
      if (!workItem) {
        throw this.invalid('Matched employee work item must be active', HttpStatus.NOT_FOUND);
      }
      if (workItem.employeeId !== plan.employeeId) {
        throw this.invalid('Plan and matched work item must belong to the same employee');
      }
      if (workItem.periodStartAt.getTime() !== plan.periodStartAt.getTime()) {
        throw this.invalid('Plan and matched work item must belong to the same reporting week');
      }
      const existingMatch = await tx.employeeWeekPlanItem.findUnique({
        where: { matchedWorkItemId: workItemId },
        select: { id: true },
      });
      if (existingMatch && existingMatch.id !== planId) {
        throw this.invalid(
          'Employee work item is already matched to another plan',
          HttpStatus.CONFLICT,
        );
      }

      const updated = await tx.employeeWeekPlanItem.update({
        where: { id: planId },
        data: {
          carryStatus: EmployeePlanCarryStatus.MATCHED,
          matchedWorkItemId: workItemId,
          cancelReason: null,
          updatedByUserId: this.requestContext.requirePrincipal().userId,
        },
        include: ACTIVE_PLAN_INCLUDE,
      });
      await this.recordAction(
        tx,
        'EMPLOYEE_WEEK_PLAN_MATCHED',
        planId,
        ['carryStatus', 'matchedWorkItemId'],
        EmployeePlanCarryStatus.MATCHED,
        plan.carryStatus,
      );
      return {
        result: { plan: updated, alreadyMatched: false },
        importBatchId: plan.importBatchId,
      };
    });
    return this.withSnapshotResult(mutation);
  }

  async unmatch(planId: string) {
    const mutation = await this.prisma.$transaction(async (tx) => {
      await this.acquireSchedulingLock(tx);
      await this.lockPlan(tx, planId);
      const plan = await this.findActivePlan(tx, planId);
      if (plan.carryStatus === EmployeePlanCarryStatus.PLANNED) {
        await this.recordAction(
          tx,
          'EMPLOYEE_WEEK_PLAN_UNMATCHED',
          planId,
          [],
          'ALREADY_PLANNED',
          plan.carryStatus,
        );
        return {
          result: { plan, alreadyPlanned: true },
          importBatchId: plan.importBatchId,
        };
      }
      if (plan.carryStatus !== EmployeePlanCarryStatus.MATCHED) {
        throw this.invalid(
          'Only a matched employee week plan can be unmatched',
          HttpStatus.CONFLICT,
        );
      }

      const updated = await tx.employeeWeekPlanItem.update({
        where: { id: planId },
        data: {
          carryStatus: EmployeePlanCarryStatus.PLANNED,
          matchedWorkItemId: null,
          cancelReason: null,
          updatedByUserId: this.requestContext.requirePrincipal().userId,
        },
        include: ACTIVE_PLAN_INCLUDE,
      });
      await this.recordAction(
        tx,
        'EMPLOYEE_WEEK_PLAN_UNMATCHED',
        planId,
        ['carryStatus', 'matchedWorkItemId'],
        EmployeePlanCarryStatus.PLANNED,
        plan.carryStatus,
      );
      return {
        result: { plan: updated, alreadyPlanned: false },
        importBatchId: plan.importBatchId,
      };
    });
    return this.withSnapshotResult(mutation);
  }

  async convertToTask(planId: string) {
    const mutation = await this.prisma.$transaction(async (tx) => {
      await this.acquireSchedulingLock(tx);
      await this.lockPlan(tx, planId);
      const plan = await this.findActivePlan(tx, planId);
      if (plan.taskId) {
        const task = await tx.workTask.findFirst({
          where: { id: plan.taskId, archivedAt: null },
        });
        if (!task) {
          throw new AppError({
            code: ErrorCodes.TASK_NOT_FOUND,
            message: 'Linked employee week plan task not found',
            statusCode: HttpStatus.CONFLICT,
          });
        }
        await this.recordAction(
          tx,
          'EMPLOYEE_WEEK_PLAN_CONVERTED_TO_TASK',
          planId,
          [],
          'ALREADY_EXISTS',
          plan.carryStatus,
        );
        return {
          result: { plan, task, alreadyExists: true },
          importBatchId: plan.importBatchId,
        };
      }
      if (plan.workKind !== EmployeeWorkKind.PROJECT || !plan.projectId) {
        throw this.invalid('Only a project employee week plan can be converted to a task');
      }
      await this.assertProjectReferences(tx, plan.projectId, null);

      const task = await this.tasks.createTaskInTransaction(tx, {
        title: plan.title,
        ...(plan.deliverableText ? { description: plan.deliverableText } : {}),
        assigneeName: plan.employee.displayName,
        priority: this.taskPriority(plan.priority),
        ...(plan.plannedCompletionAt
          ? { dueAt: plan.plannedCompletionAt.toISOString().slice(0, 10) }
          : {}),
        projectId: plan.projectId,
        sourceType: 'EMPLOYEE_WEEK_PLAN',
        sourceId: plan.id,
      });
      const updated = await tx.employeeWeekPlanItem.update({
        where: { id: planId },
        data: { taskId: task.id, updatedByUserId: this.requestContext.requirePrincipal().userId },
        include: ACTIVE_PLAN_INCLUDE,
      });
      await this.recordAction(
        tx,
        'EMPLOYEE_WEEK_PLAN_CONVERTED_TO_TASK',
        planId,
        ['taskId'],
        'CREATED',
        plan.carryStatus,
      );
      return {
        result: { plan: updated, task, alreadyExists: false },
        importBatchId: plan.importBatchId,
      };
    });
    return this.withSnapshotResult(mutation);
  }

  private async findActivePlan(tx: Prisma.TransactionClient, planId: string) {
    const principal = this.requestContext.requirePrincipal();
    const plan = await tx.employeeWeekPlanItem.findFirst({
      where: { id: planId, ...ACTIVE_PLAN_WHERE, ...this.dataScope.employeeWeekPlanItems(principal) },
      include: ACTIVE_PLAN_INCLUDE,
    });
    if (!plan) throw this.planNotFound();
    return plan;
  }

  private systemFieldsData(
    input: UpdateEmployeeWeekPlanSystemFieldsInput,
    workKind: EmployeeWorkKind,
  ): SystemFieldsData {
    if (workKind === EmployeeWorkKind.NON_PROJECT) {
      return {
        ...(input.workKind !== undefined ? { workKind } : {}),
        projectId: null,
        taskId: null,
        ...(input.plannedCompletionAt !== undefined
          ? { plannedCompletionAt: input.plannedCompletionAt }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.collaborationText !== undefined
          ? { collaborationText: input.collaborationText }
          : {}),
      };
    }
    return {
      ...(input.workKind !== undefined ? { workKind } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.plannedCompletionAt !== undefined
        ? { plannedCompletionAt: input.plannedCompletionAt }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.collaborationText !== undefined
        ? { collaborationText: input.collaborationText }
        : {}),
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
        message: 'Project employee week plan must reference an active project',
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
        message: 'Employee week plan project not found',
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
        message: 'Employee week plan task must belong to the selected active project',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private changedFields(plan: ActivePlan, data: SystemFieldsData): string[] {
    const changed = new Set<string>();
    if (data.workKind !== undefined && data.workKind !== plan.workKind) changed.add('workKind');
    if (data.plannedCompletionAt !== undefined) {
      const next = data.plannedCompletionAt as Date | null;
      if (next?.getTime() !== plan.plannedCompletionAt?.getTime()) {
        changed.add('plannedCompletionAt');
      }
    }
    if (data.priority !== undefined && data.priority !== plan.priority) changed.add('priority');
    if (data.collaborationText !== undefined && data.collaborationText !== plan.collaborationText) {
      changed.add('collaborationText');
    }
    if (data.projectId !== undefined && data.projectId !== plan.projectId) changed.add('projectId');
    if (data.taskId !== undefined && data.taskId !== plan.taskId) changed.add('taskId');
    return [...changed].sort();
  }

  private taskPriority(priority: EmployeePlanPriority): TaskPriority {
    switch (priority) {
      case EmployeePlanPriority.LOW:
        return TaskPriority.LOW;
      case EmployeePlanPriority.HIGH:
        return TaskPriority.HIGH;
      case EmployeePlanPriority.URGENT:
        return TaskPriority.CRITICAL;
      case EmployeePlanPriority.MEDIUM:
      case EmployeePlanPriority.UNSPECIFIED:
        return TaskPriority.MEDIUM;
    }
  }

  private lockPlan(tx: Prisma.TransactionClient, planId: string) {
    return tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:employee-week-plan:${planId}`}))`,
    );
  }

  private async acquireSchedulingLock(tx: Prisma.TransactionClient) {
    if (await acquireReminderSchedulingLock(tx)) return;
    throw new AppError({
      code: ErrorCodes.DATABASE_ERROR,
      message: 'Reminder scheduling is busy; retry the employee week plan change',
      statusCode: HttpStatus.CONFLICT,
    });
  }

  private lockMatchTarget(tx: Prisma.TransactionClient, workItemId: string) {
    return tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:employee-week-plan-match:${workItemId}`}))`,
    );
  }

  private recordAction(
    tx: Prisma.TransactionClient,
    action: string,
    planId: string,
    changedFields: string[],
    status: string,
    previousStatus: EmployeePlanCarryStatus,
  ) {
    return this.audit.record(
      {
        action,
        entityType: 'employeeWeekPlanItem',
        entityId: planId,
        outcome: 'SUCCEEDED',
        changedFields,
        metadata: { status, previousStatus },
      },
      tx,
    );
  }

  private async withSnapshotResult<T extends object>(mutation: {
    result: T;
    importBatchId: string;
  }) {
    const snapshot = await this.snapshots.rebuildBatch(mutation.importBatchId);
    return {
      ...mutation.result,
      snapshotStatus: snapshot.batch.snapshotStatus,
      ...(snapshot.batch.snapshotError ? { snapshotError: snapshot.batch.snapshotError } : {}),
      ...(snapshot.warning ? { snapshotWarning: snapshot.warning } : {}),
    };
  }

  private invalid(message: string, statusCode: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY) {
    return new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      statusCode,
    });
  }

  private planNotFound() {
    return new AppError({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      message: 'Employee week plan not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
