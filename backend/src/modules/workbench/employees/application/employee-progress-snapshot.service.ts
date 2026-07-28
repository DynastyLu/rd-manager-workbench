import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import {
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeProgressPeriod,
  EmployeeProgressScope,
  EmployeeProgressSnapshot,
  EmployeeSnapshotStatus,
  EmployeeWorkImportBatch,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  EmployeeWorkStatus,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../../governance/application/audit-log.service';

const EMPLOYEE_PROGRESS_SNAPSHOT_CLOCK = Symbol('EMPLOYEE_PROGRESS_SNAPSHOT_CLOCK');
const SNAPSHOT_TRANSACTION_OPTIONS = {
  maxWait: 30_000,
  timeout: 120_000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const;
const DAY_MS = 86_400_000;
const SNAPSHOT_WRITE_CHUNK_SIZE = 500;
const SNAPSHOT_VERSION_LOOKUP_CHUNK_SIZE = 10_000;
const SNAPSHOT_TRANSACTION_ATTEMPTS = 3;
const UNSET_WORK_DIRECTION = '未设置';

export interface EmployeeWorkDirectionMetrics {
  workDirection: string;
  workItemCount: number;
  completedCount: number;
  completionRate: number;
}

export interface EmployeeNextPlanMetrics {
  planCount: number;
  priorityDistribution: Record<EmployeePlanPriority, number>;
  highPriorityCount: number;
  collaborationCount: number;
  unmatchedCount: number;
  cancelledCount: number;
}

export interface EmployeeProgressMetrics {
  workItemCount: number;
  completedCount: number;
  completionRate: number | null;
  averageCompletionRate: number | null;
  plannedHours: number;
  actualHours: number;
  hoursUtilizationRate: number | null;
  missingHoursCount: number;
  hoursCompleteness: number | null;
  riskCount: number;
  blockedCount: number;
  overdueCount: number;
  projectCount: number;
  unlinkedCount: number;
  projectWorkCount: number;
  nonProjectWorkCount: number;
  legacyUnclassifiedCount: number;
  workDirectionDistribution: EmployeeWorkDirectionMetrics[];
  nextPlanMetrics: EmployeeNextPlanMetrics;
  dataComplete: boolean;
  missingWeeks: string[];
}

export interface EmployeeSnapshotRebuildResult {
  batch: EmployeeWorkImportBatch;
  warning?: { code: typeof ErrorCodes.EMPLOYEE_SNAPSHOT_GENERATION_FAILED };
}

interface SnapshotWorkItem {
  id: string;
  employeeId: string;
  projectId: string | null;
  workKind: EmployeeWorkKind | null;
  plannedCompletionAt: Date | null;
  status: EmployeeWorkStatus;
  completionRate: number | null;
  plannedHours: Prisma.Decimal | number | null;
  actualHours: Prisma.Decimal | number | null;
  riskText: string | null;
  employee: { workDirection: string | null };
}

interface SnapshotWeekPlan {
  id: string;
  employeeId: string;
  projectId: string | null;
  priority: EmployeePlanPriority;
  collaborationText: string | null;
  carryStatus: EmployeePlanCarryStatus;
}

interface SnapshotScope {
  scopeType: EmployeeProgressScope;
  scopeKey: string;
  scopeId: string | null;
  items: SnapshotWorkItem[];
  plans: SnapshotWeekPlan[];
}

type SnapshotGenerationRevision = Pick<
  EmployeeWorkImportBatch,
  | 'id'
  | 'status'
  | 'snapshotStatus'
  | 'updatedAt'
  | 'version'
  | 'periodType'
  | 'periodStartAt'
  | 'periodEndAt'
>;

@Injectable()
export class EmployeeProgressSnapshotService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly audit: AuditLogService,
    @Optional()
    @Inject(EMPLOYEE_PROGRESS_SNAPSHOT_CLOCK)
    clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  metrics(
    items: SnapshotWorkItem[],
    completeness: { missingWeeks?: string[] } = {},
    plans: SnapshotWeekPlan[] = [],
  ): EmployeeProgressMetrics {
    const workItemCount = items.length;
    const completedCount = items.filter(
      ({ status }) => status === EmployeeWorkStatus.COMPLETED,
    ).length;
    const reportedRates = items.flatMap(({ completionRate }) =>
      completionRate === null ? [] : [completionRate],
    );
    const hoursItems = items.filter(({ plannedHours }) => plannedHours !== null);
    const plannedHours = this.round(
      hoursItems.reduce((total, item) => total + this.decimalNumber(item.plannedHours), 0),
    );
    const actualHoursForUtilization = this.round(
      hoursItems.reduce((total, item) => total + this.decimalNumber(item.actualHours), 0),
    );
    const missingHoursCount = workItemCount - hoursItems.length;
    const missingWeeks = [...(completeness.missingWeeks ?? [])].sort();
    return {
      workItemCount,
      completedCount,
      completionRate:
        workItemCount === 0 ? null : this.round((completedCount / workItemCount) * 100),
      averageCompletionRate:
        reportedRates.length === 0
          ? null
          : this.round(
              reportedRates.reduce((total, value) => total + value, 0) / reportedRates.length,
            ),
      plannedHours,
      actualHours: this.round(
        items.reduce((total, item) => total + this.decimalNumber(item.actualHours), 0),
      ),
      hoursUtilizationRate:
        plannedHours > 0 ? this.round((actualHoursForUtilization / plannedHours) * 100) : null,
      missingHoursCount,
      hoursCompleteness:
        workItemCount === 0 ? null : this.round((hoursItems.length / workItemCount) * 100),
      riskCount: items.filter((item) => this.isRisk(item)).length,
      blockedCount: items.filter(({ status }) => status === EmployeeWorkStatus.BLOCKED).length,
      overdueCount: items.filter((item) => this.isOverdue(item)).length,
      projectCount: new Set(items.flatMap(({ projectId }) => (projectId ? [projectId] : []))).size,
      unlinkedCount: items.filter(({ projectId }) => projectId === null).length,
      projectWorkCount: items.filter(({ workKind }) => workKind === EmployeeWorkKind.PROJECT)
        .length,
      nonProjectWorkCount: items.filter(({ workKind }) => workKind === EmployeeWorkKind.NON_PROJECT)
        .length,
      legacyUnclassifiedCount: items.filter(({ workKind }) => workKind === null).length,
      workDirectionDistribution: this.workDirectionDistribution(items),
      nextPlanMetrics: this.nextPlanMetrics(plans),
      dataComplete: missingWeeks.length === 0,
      missingWeeks,
    };
  }

  nextPlanMetrics(plans: SnapshotWeekPlan[]): EmployeeNextPlanMetrics {
    const priorityDistribution: Record<EmployeePlanPriority, number> = {
      [EmployeePlanPriority.UNSPECIFIED]: 0,
      [EmployeePlanPriority.LOW]: 0,
      [EmployeePlanPriority.MEDIUM]: 0,
      [EmployeePlanPriority.HIGH]: 0,
      [EmployeePlanPriority.URGENT]: 0,
    };
    for (const { priority } of plans) {
      priorityDistribution[priority] += 1;
    }
    return {
      planCount: plans.length,
      priorityDistribution,
      highPriorityCount: plans.filter(
        ({ priority }) =>
          priority === EmployeePlanPriority.HIGH || priority === EmployeePlanPriority.URGENT,
      ).length,
      collaborationCount: plans.filter(({ collaborationText }) =>
        Boolean(collaborationText?.trim()),
      ).length,
      unmatchedCount: plans.filter(
        ({ carryStatus }) => carryStatus === EmployeePlanCarryStatus.PLANNED,
      ).length,
      cancelledCount: plans.filter(
        ({ carryStatus }) => carryStatus === EmployeePlanCarryStatus.CANCELLED,
      ).length,
    };
  }

  async rebuildMonth(monthContaining: Date) {
    return this.snapshotTransaction(async (tx) => {
      const { start } = this.monthBounds(monthContaining);
      await this.lockMonthPeriods(tx, monthContaining);
      await this.lock(tx, `employee-progress-snapshot:month:${this.dateOnly(start)}`);
      const snapshots = await this.generateMonth(tx, monthContaining);
      await this.audit.record(
        {
          action: 'EMPLOYEE_PROGRESS_SNAPSHOTS_REBUILT',
          entityType: 'employeeProgressSnapshot',
          entityId: `MONTH:${this.dateOnly(start)}`,
          outcome: 'SUCCEEDED',
          changedFields: ['version', 'archivedAt'],
          metadata: {
            periodType: EmployeeProgressPeriod.MONTH,
            periodStart: this.dateOnly(start),
            itemCount: snapshots.length,
          },
        },
        tx,
      );
      return snapshots[0];
    });
  }

  ensureBatch(id: string): Promise<EmployeeSnapshotRebuildResult> {
    return this.runBatch(id, false);
  }

  rebuildBatch(id: string): Promise<EmployeeSnapshotRebuildResult> {
    return this.runBatch(id, true);
  }

  private async runBatch(id: string, force: boolean): Promise<EmployeeSnapshotRebuildResult> {
    let fallbackBatch: EmployeeWorkImportBatch | null = null;
    let generationRevision: SnapshotGenerationRevision | null = null;
    try {
      const batch = await this.snapshotTransaction(async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        let current = await tx.employeeWorkImportBatch.findUnique({ where: { id } });
        current = await this.assertCurrentCompleted(tx, current, id);
        await this.lockMonthPeriods(tx, current.periodEndAt);
        await this.lock(
          tx,
          `employee-progress-snapshot:month:${this.dateOnly(
            this.monthBounds(current.periodEndAt).start,
          )}`,
        );
        current = await tx.employeeWorkImportBatch.findUnique({ where: { id } });
        current = await this.assertCurrentCompleted(tx, current, id);
        fallbackBatch = current;
        generationRevision = this.generationRevision(current);
        if (!force && current.snapshotStatus === EmployeeSnapshotStatus.READY) {
          return current;
        }
        await tx.employeeWorkImportBatch.update({
          where: { id },
          data: {
            snapshotStatus: EmployeeSnapshotStatus.GENERATING,
            snapshotError: null,
          },
        });
        await this.generateWeek(tx, current);
        await this.generateMonth(tx, current.periodEndAt);
        const ready = await tx.employeeWorkImportBatch.update({
          where: { id },
          data: {
            snapshotStatus: EmployeeSnapshotStatus.READY,
            snapshotError: null,
          },
        });
        await this.audit.record(
          {
            action: 'EMPLOYEE_PROGRESS_SNAPSHOTS_REBUILT',
            entityType: 'employeeWorkImportBatch',
            entityId: id,
            outcome: 'SUCCEEDED',
            changedFields: ['snapshotStatus'],
            metadata: {
              status: EmployeeSnapshotStatus.READY,
              periodType: current.periodType,
              periodStart: this.dateOnly(current.periodStartAt),
              periodEnd: this.dateOnly(current.periodEndAt),
            },
          },
          tx,
        );
        return ready;
      });
      return { batch };
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === ErrorCodes.EMPLOYEE_IMPORT_NOT_FOUND ||
          error.code === ErrorCodes.EMPLOYEE_IMPORT_STATE_INVALID)
      ) {
        throw error;
      }
      const batch = generationRevision
        ? ((await this.markFailed(generationRevision)) ?? fallbackBatch)
        : fallbackBatch;
      if (!batch) {
        throw new AppError({
          code: ErrorCodes.EMPLOYEE_SNAPSHOT_GENERATION_FAILED,
          message: 'Employee progress snapshot generation failed',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        });
      }
      return {
        batch,
        warning: { code: ErrorCodes.EMPLOYEE_SNAPSHOT_GENERATION_FAILED },
      };
    }
  }

  private async generateWeek(tx: Prisma.TransactionClient, batch: EmployeeWorkImportBatch) {
    const [items, plans] = await Promise.all([
      tx.employeeWorkItem.findMany({
        where: { importBatchId: batch.id, archivedAt: null },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          employeeId: true,
          projectId: true,
          workKind: true,
          plannedCompletionAt: true,
          status: true,
          completionRate: true,
          plannedHours: true,
          actualHours: true,
          riskText: true,
          employee: { select: { workDirection: true } },
        },
      }),
      tx.employeeWeekPlanItem.findMany({
        where: { importBatchId: batch.id, archivedAt: null },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          employeeId: true,
          projectId: true,
          priority: true,
          collaborationText: true,
          carryStatus: true,
        },
      }),
    ]);
    return this.replacePeriodSnapshots(
      tx,
      EmployeeProgressPeriod.WEEK,
      batch.periodStartAt,
      batch.periodEndAt,
      items,
      plans,
      [batch.id],
      [],
    );
  }

  private async generateMonth(tx: Prisma.TransactionClient, monthContaining: Date) {
    const { start, end } = this.monthBounds(monthContaining);
    const batches = await tx.employeeWorkImportBatch.findMany({
      where: {
        status: EmployeeWorkImportStatus.COMPLETED,
        periodType: EmployeeProgressPeriod.WEEK,
        archivedAt: null,
        periodEndAt: { gte: start, lte: end },
      },
      orderBy: [{ periodStartAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        periodStartAt: true,
        periodEndAt: true,
      },
    });
    const sourceBatchIds = batches.map(({ id }) => id);
    const [items, plans] = await Promise.all([
      tx.employeeWorkItem.findMany({
        where: {
          importBatchId: { in: sourceBatchIds },
          archivedAt: null,
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          employeeId: true,
          projectId: true,
          workKind: true,
          plannedCompletionAt: true,
          status: true,
          completionRate: true,
          plannedHours: true,
          actualHours: true,
          riskText: true,
          employee: { select: { workDirection: true } },
        },
      }),
      tx.employeeWeekPlanItem.findMany({
        where: {
          importBatchId: { in: sourceBatchIds },
          archivedAt: null,
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          employeeId: true,
          projectId: true,
          priority: true,
          collaborationText: true,
          carryStatus: true,
        },
      }),
    ]);
    const availableWeeks = new Set(
      batches.map(({ periodStartAt }) => this.dateOnly(periodStartAt)),
    );
    const missingWeeks = this.expectedWeeks(start, end).filter((week) => !availableWeeks.has(week));
    return this.replacePeriodSnapshots(
      tx,
      EmployeeProgressPeriod.MONTH,
      start,
      end,
      items,
      plans,
      sourceBatchIds,
      missingWeeks,
    );
  }

  private async replacePeriodSnapshots(
    tx: Prisma.TransactionClient,
    periodType: EmployeeProgressPeriod,
    periodStartAt: Date,
    periodEndAt: Date,
    items: SnapshotWorkItem[],
    plans: SnapshotWeekPlan[],
    sourceBatchIds: string[],
    missingWeeks: string[],
  ) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "app"."employee_progress_snapshots"
      WHERE "period_type" = ${periodType}::"app"."EmployeeProgressPeriod"
        AND "period_start_at" = ${this.dateOnly(periodStartAt)}::date
        AND "archived_at" IS NULL
      ORDER BY "id"
      FOR UPDATE
    `);
    const generatedAt = this.now();
    await tx.employeeProgressSnapshot.updateMany({
      where: { periodType, periodStartAt, archivedAt: null },
      data: { archivedAt: generatedAt },
    });
    const scopes = this.scopes(items, plans);
    const versions: Array<{ scopeKey: string; _max: { version: number | null } }> = [];
    const scopeKeys = scopes.map(({ scopeKey }) => scopeKey);
    for (let offset = 0; offset < scopeKeys.length; offset += SNAPSHOT_VERSION_LOOKUP_CHUNK_SIZE) {
      versions.push(
        ...(await tx.employeeProgressSnapshot.groupBy({
          by: ['scopeKey'],
          where: {
            scopeKey: {
              in: scopeKeys.slice(offset, offset + SNAPSHOT_VERSION_LOOKUP_CHUNK_SIZE),
            },
            periodType,
            periodStartAt,
          },
          _max: { version: true },
        })),
      );
    }
    const versionsByScope = new Map(
      versions.map(({ scopeKey, _max }) => [scopeKey, _max.version ?? 0]),
    );
    const created = scopes.map((scope) => {
      const metrics = this.metrics(scope.items, { missingWeeks }, scope.plans);
      return {
        id: randomUUID(),
        scopeType: scope.scopeType,
        scopeKey: scope.scopeKey,
        scopeId: scope.scopeId,
        periodType,
        periodStartAt,
        periodEndAt,
        version: (versionsByScope.get(scope.scopeKey) ?? 0) + 1,
        metrics: metrics as unknown as Prisma.InputJsonObject,
        highlights: {
          workItemIds: scope.items
            .filter(({ status }) => status === EmployeeWorkStatus.COMPLETED)
            .map(({ id }) => id),
        },
        risks: {
          workItemIds: scope.items.filter((item) => this.isRisk(item)).map(({ id }) => id),
        },
        sourceBatchIds,
        generatedAt,
        archivedAt: null,
        createdAt: generatedAt,
      } satisfies Prisma.EmployeeProgressSnapshotCreateManyInput;
    });
    for (let offset = 0; offset < created.length; offset += SNAPSHOT_WRITE_CHUNK_SIZE) {
      await tx.employeeProgressSnapshot.createMany({
        data: created.slice(offset, offset + SNAPSHOT_WRITE_CHUNK_SIZE),
      });
    }
    return created as EmployeeProgressSnapshot[];
  }

  private scopes(items: SnapshotWorkItem[], plans: SnapshotWeekPlan[]): SnapshotScope[] {
    const employees = new Map<string, SnapshotWorkItem[]>();
    const projects = new Map<string, SnapshotWorkItem[]>();
    const employeePlans = new Map<string, SnapshotWeekPlan[]>();
    const projectPlans = new Map<string, SnapshotWeekPlan[]>();
    for (const item of items) {
      const employeeItems = employees.get(item.employeeId) ?? [];
      employeeItems.push(item);
      employees.set(item.employeeId, employeeItems);
      if (item.projectId) {
        const projectItems = projects.get(item.projectId) ?? [];
        projectItems.push(item);
        projects.set(item.projectId, projectItems);
      }
    }
    for (const plan of plans) {
      const plansForEmployee = employeePlans.get(plan.employeeId) ?? [];
      plansForEmployee.push(plan);
      employeePlans.set(plan.employeeId, plansForEmployee);
      if (plan.projectId) {
        const plansForProject = projectPlans.get(plan.projectId) ?? [];
        plansForProject.push(plan);
        projectPlans.set(plan.projectId, plansForProject);
      }
    }
    const employeeIds = new Set([...employees.keys(), ...employeePlans.keys()]);
    const projectIds = new Set([...projects.keys(), ...projectPlans.keys()]);
    return [
      {
        scopeType: EmployeeProgressScope.TEAM,
        scopeKey: 'TEAM',
        scopeId: null,
        items,
        plans,
      },
      ...[...employeeIds]
        .sort((left, right) => left.localeCompare(right))
        .map((employeeId) => ({
          scopeType: EmployeeProgressScope.EMPLOYEE,
          scopeKey: `EMPLOYEE:${employeeId}`,
          scopeId: employeeId,
          items: employees.get(employeeId) ?? [],
          plans: employeePlans.get(employeeId) ?? [],
        })),
      ...[...projectIds]
        .sort((left, right) => left.localeCompare(right))
        .map((projectId) => ({
          scopeType: EmployeeProgressScope.PROJECT,
          scopeKey: `PROJECT:${projectId}`,
          scopeId: projectId,
          items: projects.get(projectId) ?? [],
          plans: projectPlans.get(projectId) ?? [],
        })),
    ];
  }

  private async markFailed(
    revision: SnapshotGenerationRevision,
  ): Promise<EmployeeWorkImportBatch | null> {
    try {
      return await this.snapshotTransaction(async (tx) => {
        await this.lock(tx, `employee-import:${revision.id}`);
        let batch = await tx.employeeWorkImportBatch.findUnique({ where: { id: revision.id } });
        if (!this.isGenerationRevision(batch, revision)) return batch;
        await this.lockMonthPeriods(tx, revision.periodEndAt);
        await this.lock(
          tx,
          `employee-progress-snapshot:month:${this.dateOnly(
            this.monthBounds(revision.periodEndAt).start,
          )}`,
        );
        batch = await tx.employeeWorkImportBatch.findUnique({ where: { id: revision.id } });
        if (!this.isGenerationRevision(batch, revision)) return batch;
        const changed = await tx.employeeWorkImportBatch.updateMany({
          where: {
            id: revision.id,
            status: revision.status,
            snapshotStatus: revision.snapshotStatus,
            updatedAt: revision.updatedAt,
            version: revision.version,
            periodType: revision.periodType,
            periodStartAt: revision.periodStartAt,
            periodEndAt: revision.periodEndAt,
          },
          data: {
            snapshotStatus: EmployeeSnapshotStatus.FAILED,
            snapshotError: ErrorCodes.EMPLOYEE_SNAPSHOT_GENERATION_FAILED,
          },
        });
        if (changed.count !== 1) {
          return tx.employeeWorkImportBatch.findUnique({ where: { id: revision.id } });
        }
        const failed = await tx.employeeWorkImportBatch.findUnique({
          where: { id: revision.id },
        });
        if (!failed) return null;
        await this.audit.record(
          {
            action: 'EMPLOYEE_PROGRESS_SNAPSHOT_REBUILD_FAILED',
            entityType: 'employeeWorkImportBatch',
            entityId: revision.id,
            outcome: 'FAILED',
            changedFields: ['snapshotStatus', 'snapshotError'],
            metadata: {
              status: EmployeeSnapshotStatus.FAILED,
              errorCode: ErrorCodes.EMPLOYEE_SNAPSHOT_GENERATION_FAILED,
              periodType: failed.periodType,
              periodStart: this.dateOnly(failed.periodStartAt),
              periodEnd: this.dateOnly(failed.periodEndAt),
            },
          },
          tx,
        );
        return failed;
      });
    } catch {
      try {
        return await this.prisma.employeeWorkImportBatch.findUnique({
          where: { id: revision.id },
        });
      } catch {
        return null;
      }
    }
  }

  private generationRevision(batch: EmployeeWorkImportBatch): SnapshotGenerationRevision {
    return {
      id: batch.id,
      status: batch.status,
      snapshotStatus: batch.snapshotStatus,
      updatedAt: batch.updatedAt,
      version: batch.version,
      periodType: batch.periodType,
      periodStartAt: batch.periodStartAt,
      periodEndAt: batch.periodEndAt,
    };
  }

  private isGenerationRevision(
    batch: EmployeeWorkImportBatch | null,
    revision: SnapshotGenerationRevision,
  ): batch is EmployeeWorkImportBatch {
    return (
      batch !== null &&
      batch.id === revision.id &&
      batch.status === revision.status &&
      batch.snapshotStatus === revision.snapshotStatus &&
      batch.updatedAt.getTime() === revision.updatedAt.getTime() &&
      batch.version === revision.version &&
      batch.periodType === revision.periodType &&
      batch.periodStartAt.getTime() === revision.periodStartAt.getTime() &&
      batch.periodEndAt.getTime() === revision.periodEndAt.getTime()
    );
  }

  private async snapshotTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SNAPSHOT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, SNAPSHOT_TRANSACTION_OPTIONS);
      } catch (error) {
        if (attempt === SNAPSHOT_TRANSACTION_ATTEMPTS || !this.isRetryableConflict(error)) {
          throw error;
        }
      }
    }
    throw new Error('Employee progress snapshot transaction retry exhausted');
  }

  private isRetryableConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  private assertCompleted(
    batch: EmployeeWorkImportBatch | null,
  ): asserts batch is EmployeeWorkImportBatch {
    if (!batch) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_NOT_FOUND,
        message: 'Employee work import batch not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    if (batch.status !== EmployeeWorkImportStatus.COMPLETED || batch.archivedAt !== null) {
      throw this.currentBatchInvalid();
    }
  }

  private async assertCurrentCompleted(
    tx: Prisma.TransactionClient,
    batch: EmployeeWorkImportBatch | null,
    id: string,
  ): Promise<EmployeeWorkImportBatch> {
    this.assertCompleted(batch);
    const current = await tx.employeeWorkImportBatch.findMany({
      where: {
        periodType: batch.periodType,
        periodStartAt: batch.periodStartAt,
        status: EmployeeWorkImportStatus.COMPLETED,
        archivedAt: null,
      },
      select: { id: true },
      take: 2,
    });
    if (current.length !== 1 || current[0].id !== id) {
      throw this.currentBatchInvalid();
    }
    return batch;
  }

  private currentBatchInvalid(): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_STATE_INVALID,
      message: 'Snapshots can only be rebuilt for the current completed import batch',
      statusCode: HttpStatus.CONFLICT,
    });
  }

  private expectedWeeks(monthStart: Date, monthEnd: Date): string[] {
    const firstWeekEndOffset = (7 - monthStart.getUTCDay()) % 7;
    const firstWeekEnd = new Date(monthStart.getTime() + firstWeekEndOffset * DAY_MS);
    const weeks: string[] = [];
    for (
      let weekEnd = firstWeekEnd;
      weekEnd <= monthEnd;
      weekEnd = new Date(weekEnd.getTime() + 7 * DAY_MS)
    ) {
      weeks.push(this.dateOnly(new Date(weekEnd.getTime() - 6 * DAY_MS)));
    }
    return weeks;
  }

  private monthBounds(value: Date): { start: Date; end: Date } {
    const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
    const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
    return { start, end };
  }

  private isRisk(item: SnapshotWorkItem): boolean {
    return (
      Boolean(item.riskText?.trim()) ||
      item.status === EmployeeWorkStatus.AT_RISK ||
      item.status === EmployeeWorkStatus.BLOCKED
    );
  }

  private isOverdue(item: SnapshotWorkItem): boolean {
    return (
      item.plannedCompletionAt !== null &&
      item.status !== EmployeeWorkStatus.COMPLETED &&
      this.dateOnly(item.plannedCompletionAt) < this.dateOnly(this.now())
    );
  }

  private workDirectionDistribution(items: SnapshotWorkItem[]): EmployeeWorkDirectionMetrics[] {
    const directionItems = new Map<string, SnapshotWorkItem[]>();
    for (const item of items) {
      const workDirection = item.employee.workDirection?.trim() || UNSET_WORK_DIRECTION;
      const grouped = directionItems.get(workDirection) ?? [];
      grouped.push(item);
      directionItems.set(workDirection, grouped);
    }
    return [...directionItems.entries()]
      .sort(([left], [right]) => {
        if (left === UNSET_WORK_DIRECTION) return 1;
        if (right === UNSET_WORK_DIRECTION) return -1;
        return left.localeCompare(right);
      })
      .map(([workDirection, grouped]) => {
        const completedCount = grouped.filter(
          ({ status }) => status === EmployeeWorkStatus.COMPLETED,
        ).length;
        return {
          workDirection,
          workItemCount: grouped.length,
          completedCount,
          completionRate: this.round((completedCount / grouped.length) * 100),
        };
      });
  }

  private decimalNumber(value: Prisma.Decimal | number | null): number {
    return value === null ? 0 : Number(value);
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async lock(tx: Prisma.TransactionClient, key: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }

  private async lockMonthPeriods(
    tx: Prisma.TransactionClient,
    monthContaining: Date,
  ): Promise<void> {
    const { start, end } = this.monthBounds(monthContaining);
    for (const weekStart of this.expectedWeeks(start, end)) {
      await this.lock(tx, `employee-import-period:${EmployeeProgressPeriod.WEEK}:${weekStart}`);
    }
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
