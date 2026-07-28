import { Injectable } from '@nestjs/common';
import {
  EmployeePlanCarryStatus,
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';

const PLAN_SELECT = {
  id: true,
  employeeId: true,
  title: true,
  periodStartAt: true,
  plannedCompletionAt: true,
  employee: { select: { displayName: true } },
  sourceRow: {
    select: { sourceSheetName: true, sourceSection: true, sourceRowNumber: true },
  },
} satisfies Prisma.EmployeeWeekPlanItemSelect;

export interface EmployeeWeekPlanReminderCandidate {
  key: string;
  resultType: 'EMPLOYEE_WEEK_PLAN_COMPLETION_REMINDER';
  planId: string;
  employee: { id: string; displayName: string };
  title: string;
  scheduledFor: string;
  deliveryTargets: ['PAGE', 'SOCKET'];
  smsEnabled: false;
  source: {
    path: string;
    periodStart: string;
    sourceSection: 'NEXT_WEEK_PLAN';
    sourceSheetName: string | null;
    sourceRowNumber: number | null;
  };
}

export type EmployeeWeekPlanReminderCandidateChange =
  | {
      kind: 'SCHEDULED';
      planId: string;
      scheduledFor: string;
    }
  | {
      kind: 'RESCHEDULED';
      planId: string;
      previousScheduledFor: string;
      scheduledFor: string;
    }
  | {
      kind: 'ARCHIVED';
      planId: string;
      previousScheduledFor: string;
      scheduledFor: null;
    };

export interface EmployeeWeekPlanReminderCandidateAuditEvent {
  action: string;
  entityType: 'employeeWeekPlanItem';
  entityId: string;
  outcome: 'SUCCEEDED';
  changedFields: ['scheduledFor'] | ['archivedAt'];
  metadata: { status: 'SCHEDULED' | 'RESCHEDULED' | 'ARCHIVED' };
}

export interface EmployeeWeekPlanReminderCandidateReconciliation {
  candidates: EmployeeWeekPlanReminderCandidate[];
  changes: EmployeeWeekPlanReminderCandidateChange[];
  auditEvents: EmployeeWeekPlanReminderCandidateAuditEvent[];
}

@Injectable()
export class EmployeeWeekPlanReminderCandidatesService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async reconcile(
    previous: readonly EmployeeWeekPlanReminderCandidate[],
  ): Promise<EmployeeWeekPlanReminderCandidateReconciliation> {
    const plans = await this.prisma.employeeWeekPlanItem.findMany({
      where: {
        archivedAt: null,
        plannedCompletionAt: { not: null },
        carryStatus: { not: EmployeePlanCarryStatus.CANCELLED },
        employee: { archivedAt: null },
        importBatch: {
          periodType: EmployeeProgressPeriod.WEEK,
          status: EmployeeWorkImportStatus.COMPLETED,
          archivedAt: null,
        },
      },
      select: PLAN_SELECT,
      orderBy: [{ plannedCompletionAt: 'asc' }, { id: 'asc' }],
    });
    const candidates = plans.map((plan) => this.toCandidate(plan));
    const previousByKey = new Map(previous.map((candidate) => [candidate.key, candidate]));
    const currentKeys = new Set(candidates.map((candidate) => candidate.key));
    const changes: EmployeeWeekPlanReminderCandidateChange[] = [];

    for (const candidate of candidates) {
      const old = previousByKey.get(candidate.key);
      if (!old) {
        changes.push({
          kind: 'SCHEDULED',
          planId: candidate.planId,
          scheduledFor: candidate.scheduledFor,
        });
      } else if (old.scheduledFor !== candidate.scheduledFor) {
        changes.push({
          kind: 'RESCHEDULED',
          planId: candidate.planId,
          previousScheduledFor: old.scheduledFor,
          scheduledFor: candidate.scheduledFor,
        });
      }
    }
    for (const old of previous) {
      if (!currentKeys.has(old.key)) {
        changes.push({
          kind: 'ARCHIVED',
          planId: old.planId,
          previousScheduledFor: old.scheduledFor,
          scheduledFor: null,
        });
      }
    }

    return {
      candidates,
      changes,
      auditEvents: changes.map((change) => this.toAuditEvent(change)),
    };
  }

  private toCandidate(
    plan: Prisma.EmployeeWeekPlanItemGetPayload<{ select: typeof PLAN_SELECT }>,
  ): EmployeeWeekPlanReminderCandidate {
    const params = new URLSearchParams({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: this.dateOnly(plan.periodStartAt),
      sourceSection: 'NEXT_WEEK_PLAN',
      planItemId: plan.id,
    });
    if (plan.sourceRow.sourceSheetName) {
      params.set('sourceSheet', plan.sourceRow.sourceSheetName);
    }
    if (plan.sourceRow.sourceRowNumber !== null) {
      params.set('sourceRow', String(plan.sourceRow.sourceRowNumber));
    }
    return {
      key: `employee-week-plan:${plan.id}`,
      resultType: 'EMPLOYEE_WEEK_PLAN_COMPLETION_REMINDER',
      planId: plan.id,
      employee: { id: plan.employeeId, displayName: plan.employee.displayName },
      title: `计划到期：${plan.title}`,
      scheduledFor: plan.plannedCompletionAt!.toISOString(),
      deliveryTargets: ['PAGE', 'SOCKET'],
      smsEnabled: false,
      source: {
        path: `/employees/${encodeURIComponent(plan.employeeId)}?${params.toString()}`,
        periodStart: this.dateOnly(plan.periodStartAt),
        sourceSection: 'NEXT_WEEK_PLAN',
        sourceSheetName: plan.sourceRow.sourceSheetName,
        sourceRowNumber: plan.sourceRow.sourceRowNumber,
      },
    };
  }

  private toAuditEvent(
    change: EmployeeWeekPlanReminderCandidateChange,
  ): EmployeeWeekPlanReminderCandidateAuditEvent {
    return {
      action: `EMPLOYEE_WEEK_PLAN_REMINDER_CANDIDATE_${change.kind}`,
      entityType: 'employeeWeekPlanItem',
      entityId: change.planId,
      outcome: 'SUCCEEDED',
      changedFields: change.kind === 'ARCHIVED' ? ['archivedAt'] : ['scheduledFor'],
      metadata: { status: change.kind },
    };
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
