import {
  EmployeePlanCarryStatus,
  EmployeeWorkImportStatus,
  NotificationStatus,
  ReminderSourceType,
} from '@prisma/client';
import { ReminderSchedulerService } from '../../../../src/modules/workbench/notifications/application/reminder-scheduler.service';

describe('ReminderSchedulerService employee week plan reminders', () => {
  it('skips the scan without reading due rules when the shared lock is unavailable', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: false }]),
      reminderRule: { findMany: jest.fn() },
      notification: { findMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new ReminderSchedulerService(
      prisma as never,
      { publish: jest.fn() } as never,
      { queueForNotification: jest.fn() } as never,
    );

    await expect(service.scanDue()).resolves.toEqual({
      skipped: true,
      created: 0,
      resurfaced: 0,
      notifications: [],
    });

    expect(tx.reminderRule.findMany).not.toHaveBeenCalled();
    expect(tx.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 2_000,
      timeout: 20_000,
    });
  });

  it('skips an overlapping in-process scan instead of opening another transaction', async () => {
    let finishFirstScan!: (value: { created: never[]; resurfaced: never[] }) => void;
    const firstScan = new Promise<{ created: never[]; resurfaced: never[] }>((resolve) => {
      finishFirstScan = resolve;
    });
    const prisma = {
      $transaction: jest
        .fn()
        .mockReturnValueOnce(firstScan)
        .mockResolvedValueOnce({ created: [], resurfaced: [] }),
    };
    const service = new ReminderSchedulerService(
      prisma as never,
      { publish: jest.fn() } as never,
      { queueForNotification: jest.fn() } as never,
    );

    const pending = service.scanDue();
    await expect(service.scanDue()).resolves.toEqual({
      skipped: true,
      created: 0,
      resurfaced: 0,
      notifications: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    finishFirstScan({ created: [], resurfaced: [] });
    await expect(pending).resolves.toEqual({
      created: 0,
      resurfaced: 0,
      notifications: [],
    });
  });

  it('creates a page notification with a direct employee plan path', async () => {
    const now = new Date('2026-08-07T00:00:00.000Z');
    const plan = {
      title: '完成接口联调',
      employeeId: 'employee-1',
      periodStartAt: new Date('2026-08-03T00:00:00.000Z'),
    };
    const created = {
      id: 'notification-1',
      reminderRuleId: 'rule-1',
      title: plan.title,
      body: '员工工作计划已到期',
      status: NotificationStatus.UNREAD,
      sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
      sourceId: 'plan-1',
      sourcePath: '/employees/employee-1?periodType=WEEK&periodStart=2026-08-03&planItemId=plan-1',
      scheduledFor: now,
      triggeredAt: now,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      reminderRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
            sourceId: 'plan-1',
            remindAt: now,
          },
        ]),
        update: jest.fn(),
      },
      employeeWeekPlanItem: {
        findFirst: jest.fn().mockResolvedValue({ title: plan.title }),
        findUnique: jest.fn().mockResolvedValue(plan),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(created),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const gateway = { publish: jest.fn() };
    const sms = { queueForNotification: jest.fn().mockResolvedValue(undefined) };
    const service = new ReminderSchedulerService(prisma as never, gateway as never, sms as never);

    await expect(service.scanDue(now)).resolves.toMatchObject({
      created: 1,
      resurfaced: 0,
      notifications: [created],
    });

    expect(tx.employeeWeekPlanItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'plan-1',
        archivedAt: null,
        carryStatus: EmployeePlanCarryStatus.PLANNED,
        plannedCompletionAt: now,
        employee: { archivedAt: null },
        importBatch: {
          archivedAt: null,
          status: EmployeeWorkImportStatus.COMPLETED,
        },
      },
      select: { title: true },
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        reminderRuleId: 'rule-1',
        title: plan.title,
        body: '员工工作计划已到期',
        status: NotificationStatus.UNREAD,
        sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
        sourceId: 'plan-1',
        sourcePath: created.sourcePath,
        scheduledFor: now,
        triggeredAt: now,
      },
    });
    expect(gateway.publish).toHaveBeenCalledWith(created);
  });

  it('archives a due rule when the plan no longer matches the exact active source state', async () => {
    const now = new Date('2026-08-07T00:00:00.000Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      reminderRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            sourceType: ReminderSourceType.EMPLOYEE_WEEK_PLAN,
            sourceId: 'plan-1',
            remindAt: now,
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: 'rule-1' }),
      },
      employeeWeekPlanItem: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new ReminderSchedulerService(
      prisma as never,
      { publish: jest.fn() } as never,
      { queueForNotification: jest.fn() } as never,
    );

    await expect(service.scanDue(now)).resolves.toMatchObject({ created: 0 });

    expect(tx.employeeWeekPlanItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'plan-1',
        archivedAt: null,
        carryStatus: EmployeePlanCarryStatus.PLANNED,
        plannedCompletionAt: now,
        employee: { archivedAt: null },
        importBatch: {
          archivedAt: null,
          status: EmployeeWorkImportStatus.COMPLETED,
        },
      },
      select: { title: true },
    });
    expect(tx.reminderRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { archivedAt: now },
    });
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});
