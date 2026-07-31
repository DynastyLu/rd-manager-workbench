import { Injectable } from '@nestjs/common';
import { ReminderChannel, ReminderSourceType } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { EmployeeWeekPlanReminderCandidatesService } from './employee-week-plan-reminder-candidates.service';
import { acquireReminderSchedulingLock } from './reminder-scheduling-lock';

const SYNC_TRANSACTION_OPTIONS = {
  maxWait: 2_000,
  timeout: 20_000,
} as const;

@Injectable()
export class EmployeeWeekPlanReminderSyncService {
  private syncRunning = false;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly candidates: EmployeeWeekPlanReminderCandidatesService,
    private readonly audit: AuditLogService,
  ) {}

  async sync(now = new Date()) {
    if (this.syncRunning) return this.skippedResult();
    this.syncRunning = true;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (!(await acquireReminderSchedulingLock(tx))) return null;
        const { candidates } = await this.candidates.reconcile([], now, tx);
        const existing = await tx.reminderRule.findMany({
          where: {
            sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
            archivedAt: null,
          },
          select: {
            id: true,
            sourceId: true,
            remindAt: true,
            archivedAt: true,
          },
          orderBy: [{ sourceId: 'asc' }, { remindAt: 'asc' }],
        });
        const desiredKeys = new Set(
          candidates.map(
            ({ planId, scheduledFor }) => `${planId}:${new Date(scheduledFor).toISOString()}`,
          ),
        );
        const stale = existing.filter(
          ({ sourceId, remindAt }) => !desiredKeys.has(`${sourceId}:${remindAt.toISOString()}`),
        );
        const existingKeys = new Set(
          existing.map(({ sourceId, remindAt }) => `${sourceId}:${remindAt.toISOString()}`),
        );
        const unscheduled = candidates.filter(
          ({ planId, scheduledFor }) =>
            !existingKeys.has(`${planId}:${new Date(scheduledFor).toISOString()}`),
        );
        if (stale.length) {
          const reminderRuleIds = stale.map(({ id }) => id);
          await tx.reminderRule.updateMany({
            where: { id: { in: reminderRuleIds }, archivedAt: null },
            data: { archivedAt: now },
          });
          await this.audit.record(
            {
              action: 'EMPLOYEE_WEEK_PLAN_REMINDER_ARCHIVED',
              entityType: 'employeeWeekPlanReminder',
              entityId: 'reconciliation',
              outcome: 'SUCCEEDED',
              changedFields: ['archivedAt'],
              metadata: { reminderRuleIds },
            },
            tx,
          );
        }

        for (const candidate of unscheduled) {
          const remindAt = new Date(candidate.scheduledFor);
          await tx.reminderRule.upsert({
            where: {
              sourceType_sourceId_remindAt: {
                sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
                sourceId: candidate.planId,
                remindAt,
              },
            },
            create: {
              sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
              sourceId: candidate.planId,
              remindAt,
              channels: [ReminderChannel.IN_APP, ReminderChannel.DESKTOP],
            },
            update: {
              archivedAt: null,
              channels: [ReminderChannel.IN_APP, ReminderChannel.DESKTOP],
            },
          });
          await this.audit.record(
            {
              action: 'EMPLOYEE_WEEK_PLAN_REMINDER_SCHEDULED',
              entityType: 'employeeWeekPlanItem',
              entityId: candidate.planId,
              outcome: 'SUCCEEDED',
              changedFields: ['plannedCompletionAt'],
              metadata: {
                scheduledFor: candidate.scheduledFor,
                sourcePath: candidate.source.path,
              },
            },
            tx,
          );
        }
        return { scheduled: unscheduled.length, archived: stale.length };
      }, SYNC_TRANSACTION_OPTIONS);
      return result ?? this.skippedResult();
    } finally {
      this.syncRunning = false;
    }
  }

  private skippedResult() {
    return {
      skipped: true as const,
      scheduled: 0,
      archived: 0,
    };
  }
}
