import { ReminderSourceType } from '@prisma/client';
import { EmployeeWeekPlanReminderSyncService } from '../../../../src/modules/workbench/notifications/application/employee-week-plan-reminder-sync.service';

describe('EmployeeWeekPlanReminderSyncService', () => {
  const candidate = {
    key: 'employee-week-plan:plan-1',
    resultType: 'EMPLOYEE_WEEK_PLAN_COMPLETION_REMINDER',
    planId: 'plan-1',
    employee: { id: 'employee-1', displayName: '张三' },
    title: '计划到期：完成接口联调',
    scheduledFor: '2026-08-07T00:00:00.000Z',
    deliveryTargets: ['PAGE', 'SOCKET'],
    smsEnabled: false,
    source: {
      path: '/employees/employee-1?planItemId=plan-1',
      periodStart: '2026-08-03',
      sourceSection: 'NEXT_WEEK_PLAN',
      sourceSheetName: '张三',
      sourceRowNumber: 20,
    },
  } as const;

  function fixture(existingRules: Array<Record<string, unknown>> = []) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      reminderRule: {
        findMany: jest.fn().mockResolvedValue(existingRules),
        upsert: jest.fn().mockResolvedValue({ id: 'rule-new' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const candidates = {
      reconcile: jest.fn().mockResolvedValue({ candidates: [candidate] }),
    };
    const audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const service = new EmployeeWeekPlanReminderSyncService(
      prisma as never,
      candidates as never,
      audit as never,
    );
    return { service, tx, candidates, audit };
  }

  it('skips reconciliation when the shared scheduling lock is unavailable', async () => {
    const { service, tx, candidates } = fixture();
    tx.$queryRaw.mockResolvedValue([{ acquired: false }]);

    await expect(service.sync()).resolves.toEqual({
      skipped: true,
      scheduled: 0,
      archived: 0,
    });

    expect(candidates.reconcile).not.toHaveBeenCalled();
    expect(tx.reminderRule.findMany).not.toHaveBeenCalled();
  });

  it('skips an overlapping in-process synchronization before opening a transaction', async () => {
    const { service } = fixture();
    const prisma = (service as unknown as { prisma: { $transaction: jest.Mock } }).prisma;
    let finishFirstSync!: (value: { scheduled: number; archived: number }) => void;
    const firstSync = new Promise<{ scheduled: number; archived: number }>((resolve) => {
      finishFirstSync = resolve;
    });
    prisma.$transaction
      .mockReturnValueOnce(firstSync)
      .mockResolvedValueOnce({ scheduled: 0, archived: 0 });

    const pending = service.sync();
    await expect(service.sync()).resolves.toEqual({
      skipped: true,
      scheduled: 0,
      archived: 0,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    finishFirstSync({ scheduled: 0, archived: 0 });
    await expect(pending).resolves.toEqual({ scheduled: 0, archived: 0 });
  });

  it('persists a reminder rule for every planned completion candidate', async () => {
    const { service, tx, candidates, audit } = fixture();
    const now = new Date('2026-07-28T08:00:00.000Z');

    await expect(service.sync(now)).resolves.toEqual({ scheduled: 1, archived: 0 });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const prisma = (service as unknown as { prisma: { $transaction: jest.Mock } }).prisma;
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 2_000,
      timeout: 20_000,
    });
    expect(candidates.reconcile).toHaveBeenCalledWith([], now, tx);
    expect(tx.reminderRule.upsert).toHaveBeenCalledWith({
      where: {
        sourceType_sourceId_remindAt: {
          sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
          sourceId: 'plan-1',
          remindAt: new Date(candidate.scheduledFor),
        },
      },
      create: {
        sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
        sourceId: 'plan-1',
        remindAt: new Date(candidate.scheduledFor),
        channels: ['IN_APP', 'DESKTOP'],
      },
      update: {
        archivedAt: null,
        channels: ['IN_APP', 'DESKTOP'],
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WEEK_PLAN_REMINDER_SCHEDULED',
        entityId: 'plan-1',
      }),
      tx,
    );
  });

  it('archives stale and rescheduled rules before creating the current rule', async () => {
    const { service, tx, audit } = fixture([
      {
        id: 'old-rule',
        sourceId: 'plan-1',
        remindAt: new Date('2026-08-06T00:00:00.000Z'),
        archivedAt: null,
      },
      {
        id: 'cancelled-plan-rule',
        sourceId: 'plan-2',
        remindAt: new Date('2026-08-08T00:00:00.000Z'),
        archivedAt: null,
      },
    ]);

    await expect(service.sync()).resolves.toEqual({ scheduled: 1, archived: 2 });

    expect(tx.reminderRule.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-rule', 'cancelled-plan-rule'] }, archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WEEK_PLAN_REMINDER_ARCHIVED',
        metadata: { reminderRuleIds: ['old-rule', 'cancelled-plan-rule'] },
      }),
      tx,
    );
  });

  it('does not rewrite or audit an unchanged active reminder rule', async () => {
    const { service, tx, audit } = fixture([
      {
        id: 'rule-current',
        sourceId: 'plan-1',
        remindAt: new Date(candidate.scheduledFor),
        archivedAt: null,
      },
    ]);

    await expect(service.sync()).resolves.toEqual({ scheduled: 0, archived: 0 });

    expect(tx.reminderRule.upsert).not.toHaveBeenCalled();
    expect(tx.reminderRule.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
