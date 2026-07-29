import {
  EmployeePlanCarryStatus,
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
} from '@prisma/client';
import {
  EmployeeWeekPlanReminderCandidate,
  EmployeeWeekPlanReminderCandidatesService,
} from '../../../../src/modules/workbench/notifications/application/employee-week-plan-reminder-candidates.service';

describe('EmployeeWeekPlanReminderCandidatesService', () => {
  const plan = {
    id: 'plan/1',
    employeeId: 'employee/1',
    title: '完成灰度发布',
    periodStartAt: new Date('2026-07-27T00:00:00.000Z'),
    plannedCompletionAt: new Date('2026-08-01T00:00:00.000Z'),
    employee: { displayName: '张三' },
    sourceRow: {
      sourceSheetName: '张三',
      sourceSection: 'NEXT_WEEK_PLAN',
      sourceRowNumber: 23,
    },
  };
  const prisma = {
    employeeWeekPlanItem: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.employeeWeekPlanItem.findMany.mockResolvedValue([plan]);
  });

  const createService = () => new EmployeeWeekPlanReminderCandidatesService(prisma as never);

  it('returns page and socket candidates without enabling SMS', async () => {
    const service = createService();
    const now = new Date('2026-07-28T08:00:00.000Z');

    const result = await service.reconcile([], now);

    expect(result.candidates).toEqual([
      {
        key: 'employee-week-plan:plan/1',
        resultType: 'EMPLOYEE_WEEK_PLAN_COMPLETION_REMINDER',
        planId: 'plan/1',
        employee: { id: 'employee/1', displayName: '张三' },
        title: '计划到期：完成灰度发布',
        scheduledFor: '2026-08-01T00:00:00.000Z',
        deliveryTargets: ['PAGE', 'SOCKET'],
        smsEnabled: false,
        source: {
          path: '/employees/employee%2F1?periodType=WEEK&periodStart=2026-07-27&sourceSection=NEXT_WEEK_PLAN&planItemId=plan%2F1&sourceSheet=%E5%BC%A0%E4%B8%89&sourceRow=23',
          periodStart: '2026-07-27',
          sourceSection: 'NEXT_WEEK_PLAN',
          sourceSheetName: '张三',
          sourceRowNumber: 23,
        },
      },
    ]);
    expect(result.changes).toEqual([
      expect.objectContaining({
        kind: 'SCHEDULED',
        planId: 'plan/1',
        scheduledFor: '2026-08-01T00:00:00.000Z',
      }),
    ]);
    expect(result.auditEvents).toEqual([
      {
        action: 'EMPLOYEE_WEEK_PLAN_REMINDER_CANDIDATE_SCHEDULED',
        entityType: 'employeeWeekPlanItem',
        entityId: 'plan/1',
        outcome: 'SUCCEEDED',
        changedFields: ['scheduledFor'],
        metadata: { status: 'SCHEDULED' },
      },
    ]);
    expect(prisma.employeeWeekPlanItem.findMany).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        plannedCompletionAt: { gte: new Date('2026-07-27T08:00:00.000Z') },
        carryStatus: EmployeePlanCarryStatus.PLANNED,
        employee: { archivedAt: null },
        importBatch: {
          periodType: EmployeeProgressPeriod.WEEK,
          status: EmployeeWorkImportStatus.COMPLETED,
          archivedAt: null,
        },
      },
      select: expect.any(Object),
      orderBy: [{ plannedCompletionAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('does not schedule the historical backlog on its first reconciliation', async () => {
    prisma.employeeWeekPlanItem.findMany.mockResolvedValue([]);
    const service = createService();
    const now = new Date('2026-07-28T08:00:00.000Z');

    const result = await service.reconcile([], now);

    expect(result.candidates).toEqual([]);
    expect(result.changes).toEqual([]);
    expect(prisma.employeeWeekPlanItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plannedCompletionAt: { gte: new Date('2026-07-27T08:00:00.000Z') },
        }),
      }),
    );
  });

  it('reports date changes as reschedules and missing or cancelled plans as archives', async () => {
    const previous: EmployeeWeekPlanReminderCandidate[] = [
      {
        key: 'employee-week-plan:plan/1',
        resultType: 'EMPLOYEE_WEEK_PLAN_COMPLETION_REMINDER',
        planId: 'plan/1',
        employee: { id: 'employee/1', displayName: '张三' },
        title: '计划到期：完成灰度发布',
        scheduledFor: '2026-07-31T00:00:00.000Z',
        deliveryTargets: ['PAGE', 'SOCKET'],
        smsEnabled: false,
        source: {
          path: '/employees/employee%2F1',
          periodStart: '2026-07-27',
          sourceSection: 'NEXT_WEEK_PLAN',
          sourceSheetName: '张三',
          sourceRowNumber: 23,
        },
      },
      {
        key: 'employee-week-plan:cancelled',
        resultType: 'EMPLOYEE_WEEK_PLAN_COMPLETION_REMINDER',
        planId: 'cancelled',
        employee: { id: 'employee-2', displayName: '李四' },
        title: '计划到期：已取消计划',
        scheduledFor: '2026-08-02T00:00:00.000Z',
        deliveryTargets: ['PAGE', 'SOCKET'],
        smsEnabled: false,
        source: {
          path: '/employees/employee-2',
          periodStart: '2026-07-27',
          sourceSection: 'NEXT_WEEK_PLAN',
          sourceSheetName: '李四',
          sourceRowNumber: 24,
        },
      },
    ];
    const service = createService();
    const now = new Date('2026-07-28T08:00:00.000Z');

    const result = await service.reconcile(previous, now);

    expect(result.changes).toEqual([
      {
        kind: 'RESCHEDULED',
        planId: 'plan/1',
        previousScheduledFor: '2026-07-31T00:00:00.000Z',
        scheduledFor: '2026-08-01T00:00:00.000Z',
      },
      {
        kind: 'ARCHIVED',
        planId: 'cancelled',
        previousScheduledFor: '2026-08-02T00:00:00.000Z',
        scheduledFor: null,
      },
    ]);
    expect(result.auditEvents).toEqual([
      expect.objectContaining({
        action: 'EMPLOYEE_WEEK_PLAN_REMINDER_CANDIDATE_RESCHEDULED',
        entityId: 'plan/1',
        changedFields: ['scheduledFor'],
      }),
      expect.objectContaining({
        action: 'EMPLOYEE_WEEK_PLAN_REMINDER_CANDIDATE_ARCHIVED',
        entityId: 'cancelled',
        changedFields: ['archivedAt'],
      }),
    ]);
  });

  it('emits no lifecycle changes for an unchanged candidate', async () => {
    const service = createService();
    const now = new Date('2026-07-28T08:00:00.000Z');
    const initial = await service.reconcile([], now);

    const result = await service.reconcile(initial.candidates, now);

    expect(result.changes).toEqual([]);
    expect(result.auditEvents).toEqual([]);
  });
});
