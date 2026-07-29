import {
  EmployeeImportRowStatus,
  EmployeeProgressPeriod,
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  EmployeeWorkStatus,
} from '@prisma/client';
import { EmployeeProgressQueryService } from '../../../../src/modules/workbench/employees/application/employee-progress-query.service';

function sqlText(query: { strings?: readonly string[] }): string {
  return query.strings?.join(' ') ?? '';
}

describe('EmployeeProgressQueryService', () => {
  const prisma = {
    employeeWorkItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    employeeWorkImportBatch: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    employeeWorkImportRow: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    employeeWeekPlanItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    employeeProgressSnapshot: {
      findFirst: jest.fn(),
    },
    resourceProfile: {
      findFirst: jest.fn(),
    },
    project: {
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const storage = {
    stat: jest.fn(),
  };

  const firstItem = {
    id: 'work-1',
    employeeId: 'employee-1',
    importBatchId: 'batch-2',
    sourceRowId: 'row-1',
    periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
    periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
    title: '完成查询接口',
    workKind: EmployeeWorkKind.PROJECT,
    plannedCompletionAt: new Date('2026-07-24T00:00:00.000Z'),
    planText: '实现接口',
    summaryText: '完成实现',
    completionRate: 100,
    status: EmployeeWorkStatus.COMPLETED,
    nextPlanText: '联调',
    riskText: null,
    plannedHours: 8,
    actualHours: 7,
    projectId: 'project-1',
    taskId: 'task-1',
    riskId: 'risk-1',
    note: null,
    createdAt: new Date('2026-07-23T00:00:00.000Z'),
    updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    employee: {
      id: 'employee-1',
      displayName: '张三',
      department: '研发部',
      roleTitle: '工程师',
      workDirection: '平台研发',
    },
    project: {
      id: 'project-1',
      code: 'RD-026',
      name: '研发工作台',
      archivedAt: null,
    },
    task: {
      id: 'task-1',
      code: 'TASK-026',
      title: '查询接口',
      archivedAt: null,
    },
    importBatch: {
      id: 'batch-2',
      version: 2,
      status: EmployeeWorkImportStatus.COMPLETED,
    },
    sourceRow: {
      rowNumber: 2,
      sourceSheetName: '张三',
      sourceSection: 'CURRENT_WORK',
      sourceRowNumber: 7,
      sourceKey: '张三:CURRENT_WORK:7',
    },
  };

  const riskyItem = {
    ...firstItem,
    id: 'work-2',
    sourceRowId: 'row-2',
    title: '处理风险',
    completionRate: 50,
    status: EmployeeWorkStatus.AT_RISK,
    riskText: '依赖未就绪',
    plannedHours: 4,
    actualHours: 5,
    projectId: null,
    taskId: null,
    project: null,
    task: null,
    sourceRow: { rowNumber: 3 },
  };

  const nextWeekPlan = {
    id: 'plan-1',
    employeeId: 'employee-1',
    importBatchId: 'batch-2',
    sourceRowId: 'row-plan-1',
    periodStartAt: new Date('2026-07-27T00:00:00.000Z'),
    periodEndAt: new Date('2026-08-02T00:00:00.000Z'),
    title: '完成联调',
    deliverableText: '交付验收记录',
    plannedCompletionAt: new Date('2026-07-30T00:00:00.000Z'),
    priority: EmployeePlanPriority.HIGH,
    collaborationText: '需要测试协作',
    planText: '完成接口联调',
    note: '重点事项',
    workKind: EmployeeWorkKind.PROJECT,
    projectId: 'project-1',
    taskId: 'task-1',
    carryStatus: EmployeePlanCarryStatus.PLANNED,
    matchedWorkItemId: null,
    cancelReason: null,
    employee: firstItem.employee,
    project: firstItem.project,
    task: firstItem.task,
    importBatch: firstItem.importBatch,
    sourceRow: {
      rowNumber: 9,
      sourceSheetName: '张三',
      sourceSection: 'NEXT_WEEK_PLAN',
      sourceRowNumber: 20,
      sourceKey: '张三:NEXT_WEEK_PLAN:20',
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((work) => work(prisma));
    prisma.employeeWorkItem.findMany.mockImplementation(({ where = {} } = {}) => {
      const ids = where.id?.in as string[] | undefined;
      return ids
        ? [firstItem, riskyItem].filter(({ id }) => ids.includes(id))
        : [firstItem, riskyItem];
    });
    prisma.employeeWorkItem.count.mockResolvedValue(2);
    prisma.employeeWeekPlanItem.findMany.mockResolvedValue([nextWeekPlan]);
    prisma.employeeWeekPlanItem.findFirst.mockResolvedValue(nextWeekPlan);
    prisma.employeeWeekPlanItem.count.mockResolvedValue(1);
    prisma.employeeProgressSnapshot.findFirst.mockResolvedValue(null);
    prisma.employeeWorkImportBatch.findMany.mockResolvedValue([
      {
        id: 'batch-2',
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      },
    ]);
    prisma.resourceProfile.findFirst.mockResolvedValue(firstItem.employee);
    prisma.project.findFirst.mockResolvedValue(firstItem.project);
    prisma.$queryRaw.mockImplementation((query) => {
      const text = sqlText(query);
      const metrics = {
        workItemCount: 2,
        completedCount: 1,
        averageCompletionRate: 75,
        plannedHours: 12,
        actualHours: 12,
        riskCount: 1,
        blockedCount: 0,
        projectCount: 1,
        unlinkedCount: 1,
      };
      if (text.includes('employee_progress:metrics')) return [metrics];
      if (text.includes('employee_progress:risk_ids')) return [{ id: 'work-2' }];
      if (text.includes('employee_progress:employee_summaries')) {
        return [
          {
            ...metrics,
            employeeId: 'employee-1',
            displayName: '张三',
            department: '研发部',
            roleTitle: '工程师',
            sourceBatchIds: ['batch-2'],
            total: 1,
          },
        ];
      }
      if (text.includes('employee_progress:project_summaries')) {
        return [
          {
            ...metrics,
            workItemCount: 1,
            completedCount: 1,
            averageCompletionRate: 100,
            plannedHours: 8,
            actualHours: 7,
            riskCount: 0,
            unlinkedCount: 0,
            projectId: 'project-1',
            projectCode: 'RD-026',
            projectName: '研发工作台',
            archived: false,
            participantCount: 1,
            sourceBatchIds: ['batch-2'],
            total: 1,
          },
        ];
      }
      if (text.includes('employee_progress:completed_details')) {
        return [
          { employeeId: 'employee-1', workItemId: 'work-1', text: firstItem.title, total: 1 },
        ];
      }
      if (text.includes('employee_progress:next_plan_details')) {
        return [
          {
            employeeId: 'employee-1',
            workItemId: 'work-1',
            text: firstItem.nextPlanText,
            total: 1,
          },
        ];
      }
      if (text.includes('employee_progress:risk_details')) return [];
      return [];
    });
    storage.stat.mockResolvedValue({ kind: 'FILE', size: 100 });
  });

  const createService = () =>
    new (EmployeeProgressQueryService as unknown as new (
      prisma: unknown,
      storage: unknown,
    ) => EmployeeProgressQueryService)(prisma, storage);

  it('returns filtered team metrics, employee rows, project contribution, completeness, and drill-through links', async () => {
    const service = createService();

    const result = await service.team({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      department: '研发部',
      projectId: 'project-1',
      status: EmployeeWorkStatus.IN_PROGRESS,
    });

    expect(result).toEqual(
      expect.objectContaining({
        period: {
          type: EmployeeProgressPeriod.WEEK,
          start: '2026-07-20',
          end: '2026-07-26',
        },
        metrics: expect.objectContaining({
          workItemCount: 2,
          completedCount: 1,
          completionRate: 50,
          averageCompletionRate: 75,
          plannedHours: 12,
          actualHours: 12,
          riskCount: 1,
          projectCount: 1,
          unlinkedCount: 1,
          dataComplete: true,
        }),
        sourceBatchIds: ['batch-2'],
        employees: expect.objectContaining({
          data: [
            expect.objectContaining({
              employeeId: 'employee-1',
              employeeProgressUrl: expect.stringMatching(
                /periodType=WEEK.*periodStart=2026-07-20.*department=.*projectId=project-1.*status=IN_PROGRESS/,
              ),
              workItemsUrl: expect.stringMatching(
                /periodType=WEEK.*periodStart=2026-07-20.*employeeId=employee-1.*department=.*projectId=project-1.*status=IN_PROGRESS/,
              ),
            }),
          ],
          total: 1,
          hasMore: false,
        }),
        projects: expect.objectContaining({
          data: [
            expect.objectContaining({
              projectId: 'project-1',
              projectCode: 'RD-026',
              projectProgressUrl: expect.stringMatching(
                /periodType=WEEK.*periodStart=2026-07-20.*department=.*status=IN_PROGRESS/,
              ),
              workItemsUrl: expect.stringContaining('projectId=project-1'),
            }),
          ],
          total: 1,
          hasMore: false,
        }),
      }),
    );
    expect(result).not.toHaveProperty('workItems');
    expect(result.risks).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 'work-2',
            sourceBatchIds: ['batch-2'],
            links: expect.objectContaining({
              selfUrl: '/employee-work-items/work-2',
              employeeProgressUrl: expect.stringContaining(
                'periodType=WEEK&periodStart=2026-07-20',
              ),
              sourceBatchUrl: '/employee-work-imports/batch-2',
            }),
          }),
        ],
        total: 1,
        hasMore: false,
      }),
    );
    expect(prisma.employeeWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ riskId: true }),
        where: expect.objectContaining({
          archivedAt: null,
          employee: expect.objectContaining({ department: '研发部', archivedAt: null }),
          importBatch: expect.objectContaining({
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
            periodType: EmployeeProgressPeriod.WEEK,
            periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
            periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
          }),
        }),
      }),
    );
    expect(prisma.employeeWorkItem.findMany.mock.calls[0][0]).not.toHaveProperty('include');
    expect(prisma.$queryRaw).toHaveBeenCalled();
    const rawQueries = prisma.$queryRaw.mock.calls.map(
      ([sql]) => sql as { strings: readonly string[]; values: unknown[] },
    );
    expect(rawQueries.flatMap(({ values }) => values)).toContain('研发部');
    const rawSqlText = rawQueries.map(({ strings }) => strings.join(' ')).join(' ');
    expect(rawSqlText).not.toContain('研发部');
    expect(rawSqlText).toContain('batch.period_type');
    expect(rawSqlText).toContain('batch.period_start_at');
    expect(rawSqlText).toContain('batch.period_end_at');
    expect(
      prisma.employeeWorkItem.findMany.mock.calls.every(
        ([args]) => typeof args.take === 'number' && args.take <= 20,
      ),
    ).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      maxWait: 30_000,
      timeout: 120_000,
    });
  });

  it('uses strict UTC period starts and caps work-item pagination at 100', async () => {
    const service = createService();

    await expect(
      service.team({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: '2026-07-21',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    await expect(
      service.team({
        periodType: EmployeeProgressPeriod.MONTH,
        periodStart: '2026-07-02',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });

    const page = await service.workItems({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      employeeId: 'employee-1',
      department: '研发部',
      projectId: 'project-1',
      status: EmployeeWorkStatus.COMPLETED,
      page: 1,
      pageSize: 500,
    });
    expect(page.meta).toEqual({ page: 1, pageSize: 100, total: 2 });
    expect(page.sourceBatchIds).toEqual(['batch-2']);
    expect(page.data[0]).toEqual(
      expect.objectContaining({
        id: 'work-1',
        riskId: 'risk-1',
        project: expect.objectContaining({ code: 'RD-026', archived: false }),
        task: expect.objectContaining({ code: 'TASK-026', archived: false }),
        links: expect.objectContaining({
          employeeProgressUrl: expect.stringContaining('periodType=WEEK&periodStart=2026-07-20'),
          projectProgressUrl: expect.stringContaining('periodType=WEEK&periodStart=2026-07-20'),
          taskUrl: '/projects/project-1?taskId=task-1',
        }),
      }),
    );
    expect(page.links.progressUrl).toMatch(
      /employees\/employee-1\/progress\?periodType=WEEK.*periodStart=2026-07-20.*department=.*projectId=project-1.*status=COMPLETED/,
    );
    expect(prisma.employeeWorkItem.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
        select: expect.objectContaining({
          project: { select: expect.objectContaining({ archivedAt: true }) },
          task: { select: expect.objectContaining({ archivedAt: true }) },
        }),
      }),
    );
  });

  it('exposes V2 work classification, due metadata, work direction, and real Excel coordinates', async () => {
    const service = createService();

    const result = await service.workItems({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      employeeId: 'employee-1',
    });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        workKind: EmployeeWorkKind.PROJECT,
        workDirection: '平台研发',
        plannedCompletionDate: '2026-07-24',
        overdue: false,
        classificationState: 'CLASSIFIED',
        source: {
          sheetName: '张三',
          section: 'CURRENT_WORK',
          rowNumber: 7,
          key: '张三:CURRENT_WORK:7',
          label: '张三 / 本周工作 / 第 7 行',
        },
      }),
    );
  });

  it('uses the current snapshot to expose V2 progress metrics and next-plan metrics', async () => {
    prisma.employeeProgressSnapshot.findFirst.mockResolvedValue({
      metrics: {
        workItemCount: 2,
        completedCount: 1,
        completionRate: 50,
        averageCompletionRate: 75,
        plannedHours: 12,
        actualHours: 12,
        hoursUtilizationRate: 100,
        missingHoursCount: 0,
        hoursCompleteness: 100,
        riskCount: 1,
        blockedCount: 0,
        overdueCount: 1,
        projectCount: 1,
        unlinkedCount: 1,
        projectWorkCount: 1,
        nonProjectWorkCount: 1,
        legacyUnclassifiedCount: 0,
        workDirectionDistribution: [
          {
            workDirection: '平台研发',
            workItemCount: 2,
            completedCount: 1,
            completionRate: 50,
          },
        ],
        nextPlanMetrics: {
          planCount: 1,
          priorityDistribution: {
            UNSPECIFIED: 0,
            LOW: 0,
            MEDIUM: 0,
            HIGH: 1,
            URGENT: 0,
          },
          highPriorityCount: 1,
          collaborationCount: 1,
          unmatchedCount: 1,
          cancelledCount: 0,
        },
        dataComplete: true,
        missingWeeks: [],
      },
    });
    const service = createService();

    const result = await service.team({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
    });

    expect(result.metrics).toEqual(
      expect.objectContaining({
        overdueCount: 1,
        projectWorkCount: 1,
        nonProjectWorkCount: 1,
        missingHoursCount: 0,
        hoursCompleteness: 100,
        hoursUtilizationRate: 100,
        workDirectionDistribution: [
          expect.objectContaining({ workDirection: '平台研发', workItemCount: 2 }),
        ],
      }),
    );
    expect(result.nextPlanMetrics).toEqual(
      expect.objectContaining({
        planCount: 1,
        highPriorityCount: 1,
        collaborationCount: 1,
      }),
    );
    expect(prisma.employeeProgressSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        scopeKey: 'TEAM',
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        archivedAt: null,
      },
      orderBy: [{ version: 'desc' }, { generatedAt: 'desc' }, { id: 'desc' }],
      select: { metrics: true },
    });
  });

  it('applies bounded V2 filters to current work and future plan queries', async () => {
    const service = createService();

    await service.workItems({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      workDirection: '平台研发',
      workKind: EmployeeWorkKind.PROJECT,
      projectId: 'project-1',
      taskId: 'task-1',
      dueDateFrom: '2026-07-21',
      dueDateTo: '2026-07-25',
      riskOnly: true,
    });
    await service.weekPlans({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-27',
      priority: EmployeePlanPriority.HIGH,
      projectId: 'project-1',
      workDirection: '平台研发',
      dueDateFrom: '2026-07-28',
      dueDateTo: '2026-07-31',
    });

    expect(prisma.employeeWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workKind: EmployeeWorkKind.PROJECT,
          projectId: 'project-1',
          taskId: 'task-1',
          plannedCompletionAt: {
            gte: new Date('2026-07-21T00:00:00.000Z'),
            lte: new Date('2026-07-25T00:00:00.000Z'),
          },
          OR: [
            { riskText: { not: null } },
            { status: { in: [EmployeeWorkStatus.AT_RISK, EmployeeWorkStatus.BLOCKED] } },
          ],
          employee: expect.objectContaining({
            archivedAt: null,
            workDirection: '平台研发',
          }),
        }),
      }),
    );
    expect(prisma.employeeWeekPlanItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          priority: EmployeePlanPriority.HIGH,
          projectId: 'project-1',
          plannedCompletionAt: {
            gte: new Date('2026-07-28T00:00:00.000Z'),
            lte: new Date('2026-07-31T00:00:00.000Z'),
          },
          employee: expect.objectContaining({
            archivedAt: null,
            workDirection: '平台研发',
          }),
        }),
      }),
    );
  });

  it('lists next-week plans separately with collaboration, carry status, and source links', async () => {
    const service = createService();

    const result = await service.weekPlans({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-27',
      employeeId: 'employee-1',
      projectId: 'project-1',
      carryStatus: EmployeePlanCarryStatus.PLANNED,
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual(
      expect.objectContaining({
        period: { type: 'WEEK', start: '2026-07-27', end: '2026-08-02' },
        meta: { page: 1, pageSize: 20, total: 1 },
        data: [
          expect.objectContaining({
            id: 'plan-1',
            title: '完成联调',
            deliverableText: '交付验收记录',
            priority: EmployeePlanPriority.HIGH,
            collaborationText: '需要测试协作',
            carryStatus: EmployeePlanCarryStatus.PLANNED,
            workDirection: '平台研发',
            plannedCompletionDate: '2026-07-30',
            source: expect.objectContaining({
              label: '张三 / 下周计划 / 第 20 行',
            }),
            links: expect.objectContaining({
              selfUrl: '/employee-week-plans/plan-1',
              sourceBatchUrl: '/employee-work-imports/batch-2',
              projectProgressUrl: expect.stringContaining('/projects/project-1/team-progress'),
            }),
          }),
        ],
      }),
    );
    expect(prisma.employeeWeekPlanItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'employee-1',
          projectId: 'project-1',
          carryStatus: EmployeePlanCarryStatus.PLANNED,
          archivedAt: null,
        }),
        take: 20,
      }),
    );
  });

  it('narrows monthly facts through overlapping weekly batch bounds before work-item guards', async () => {
    const service = createService();

    await service.team({
      periodType: EmployeeProgressPeriod.MONTH,
      periodStart: '2026-07-01',
    });

    const rawQueries = prisma.$queryRaw.mock.calls.map(
      ([sql]) => sql as { strings: readonly string[]; values: unknown[] },
    );
    const rawSqlText = rawQueries.map(({ strings }) => strings.join(' ')).join(' ');
    const rawValues = rawQueries.flatMap(({ values }) => values);
    expect(rawSqlText).toContain('batch.period_type');
    expect(rawSqlText).toContain('batch.period_start_at');
    expect(rawSqlText).toContain('batch.period_end_at');
    expect(rawSqlText).toContain('wi.period_end_at');
    expect(rawSqlText).not.toContain('batch.period_type::text');
    expect(rawSqlText).not.toContain('batch.status::text');
    expect(rawSqlText).toContain('::app."EmployeeProgressPeriod"');
    expect(rawSqlText).toContain('::app."EmployeeWorkImportStatus"');
    expect(rawValues).toContain(EmployeeProgressPeriod.WEEK);
    expect(rawValues).toContainEqual(new Date('2026-06-29T00:00:00.000Z'));
    expect(rawValues).toContainEqual(new Date('2026-07-31T00:00:00.000Z'));
  });

  it('preserves null planned and actual hours instead of fabricating zeros', async () => {
    prisma.employeeWorkItem.findMany.mockResolvedValue([
      { ...firstItem, plannedHours: null, actualHours: null },
    ]);
    prisma.employeeWorkItem.count.mockResolvedValue(1);
    const service = createService();

    const result = await service.workItems({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
    });

    expect(result.data[0]).toMatchObject({ plannedHours: null, actualHours: null });
  });

  it('retains archived project and task labels without publishing stale resource links', async () => {
    prisma.employeeWorkItem.findMany.mockResolvedValue([
      {
        ...firstItem,
        project: {
          ...firstItem.project,
          archivedAt: new Date('2026-07-23T00:00:00.000Z'),
        },
        task: {
          ...firstItem.task,
          archivedAt: new Date('2026-07-23T00:00:00.000Z'),
        },
      },
    ]);
    prisma.employeeWorkItem.count.mockResolvedValue(1);
    const service = createService();

    const result = await service.workItems({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
    });

    expect(result.data[0]).toMatchObject({
      project: {
        id: 'project-1',
        code: 'RD-026',
        name: '研发工作台',
        archived: true,
      },
      task: {
        id: 'task-1',
        code: 'TASK-026',
        title: '查询接口',
        archived: true,
      },
    });
    expect(result.data[0].links).not.toHaveProperty('projectProgressUrl');
    expect(result.data[0].links).not.toHaveProperty('taskUrl');
  });

  it('keeps current source batch provenance when filters match no work items', async () => {
    prisma.employeeWorkItem.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockImplementation((query) => {
      const text = sqlText(query);
      if (text.includes('employee_progress:metrics')) {
        return [
          {
            workItemCount: 0,
            completedCount: 0,
            averageCompletionRate: null,
            plannedHours: 0,
            actualHours: 0,
            riskCount: 0,
            blockedCount: 0,
            projectCount: 0,
            unlinkedCount: 0,
          },
        ];
      }
      return [];
    });
    const service = createService();

    const result = await service.team({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      status: EmployeeWorkStatus.BLOCKED,
    });

    expect(result.sourceBatchIds).toEqual(['batch-2']);
    expect(result.metrics).toMatchObject({ workItemCount: 0, dataComplete: true });
  });

  it('keeps exact 50000-row metrics while fetching only top 100 groups and top 20 risks', async () => {
    const metrics = {
      workItemCount: 50_000,
      completedCount: 25_000,
      averageCompletionRate: 75,
      plannedHours: 400_000,
      actualHours: 350_000,
      riskCount: 10_000,
      blockedCount: 5_000,
      projectCount: 50_000,
      unlinkedCount: 0,
    };
    prisma.$queryRaw.mockImplementation((query) => {
      const text = sqlText(query);
      if (text.includes('employee_progress:metrics')) return [metrics];
      if (text.includes('employee_progress:risk_ids')) {
        return Array.from({ length: 20 }, (_, index) => ({ id: `risk-${index}` }));
      }
      if (text.includes('employee_progress:employee_summaries')) {
        return Array.from({ length: 100 }, (_, index) => ({
          ...metrics,
          workItemCount: 1,
          employeeId: `employee-${index}`,
          displayName: `员工 ${String(index).padStart(3, '0')}`,
          department: '研发部',
          roleTitle: '工程师',
          sourceBatchIds: ['batch-2'],
          total: 50_000,
        }));
      }
      if (text.includes('employee_progress:project_summaries')) {
        return Array.from({ length: 100 }, (_, index) => ({
          ...metrics,
          workItemCount: 1,
          projectId: `project-${index}`,
          projectCode: `PROJECT-${String(index).padStart(3, '0')}`,
          projectName: `项目 ${index}`,
          archived: false,
          participantCount: 1,
          sourceBatchIds: ['batch-2'],
          total: 50_000,
        }));
      }
      return [];
    });
    prisma.employeeWorkItem.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        ...riskyItem,
        id: `risk-${index}`,
      })),
    );
    const service = createService();

    const result = await service.team({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
    });

    expect(result.metrics).toMatchObject({
      workItemCount: 50_000,
      completedCount: 25_000,
      riskCount: 10_000,
      projectCount: 50_000,
    });
    expect(result.employees).toMatchObject({ total: 50_000, limit: 100, hasMore: true });
    expect(result.employees.data).toHaveLength(100);
    expect(result.projects).toMatchObject({ total: 50_000, limit: 100, hasMore: true });
    expect(result.projects.data).toHaveLength(100);
    expect(result.risks).toMatchObject({ total: 10_000, limit: 20, hasMore: true });
    expect(result.risks.data).toHaveLength(20);
    expect(
      prisma.$queryRaw.mock.calls.some(([sql]) => {
        const query = sql as { strings: readonly string[]; values: unknown[] };
        return (
          query.strings.join(' ').includes('employee_progress:employee_summaries') &&
          query.values.includes(100)
        );
      }),
    ).toBe(true);
    expect(
      prisma.employeeWorkItem.findMany.mock.calls.every(
        ([args]) => typeof args.take === 'number' && args.take <= 20,
      ),
    ).toBe(true);
  });

  it('bounds project employee work summaries and includes same-period employee progress links', async () => {
    prisma.$queryRaw.mockImplementation((query) => {
      const text = sqlText(query);
      const metrics = {
        workItemCount: 15,
        completedCount: 15,
        averageCompletionRate: 100,
        plannedHours: 120,
        actualHours: 105,
        riskCount: 15,
        blockedCount: 0,
        projectCount: 1,
        unlinkedCount: 0,
      };
      if (text.includes('employee_progress:metrics')) return [metrics];
      if (text.includes('employee_progress:risk_ids')) return [];
      if (text.includes('employee_progress:employee_summaries')) {
        return [
          {
            ...metrics,
            employeeId: 'employee-1',
            displayName: '张三',
            department: '研发部',
            roleTitle: '工程师',
            sourceBatchIds: ['batch-2'],
            total: 1,
          },
        ];
      }
      const detailTag = [
        'employee_progress:completed_details',
        'employee_progress:next_plan_details',
        'employee_progress:risk_details',
      ].find((tag) => text.includes(tag));
      if (detailTag) {
        return Array.from({ length: 10 }, (_, index) => ({
          employeeId: 'employee-1',
          workItemId: `work-${index}`,
          text:
            detailTag === 'employee_progress:completed_details'
              ? `完成事项 ${index}`
              : detailTag === 'employee_progress:next_plan_details'
                ? `下期计划 ${index}`
                : `风险 ${index}`,
          total: 15,
        }));
      }
      return [];
    });
    const service = createService();

    const result = await service.project('project-1', {
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      department: '研发部',
      status: EmployeeWorkStatus.COMPLETED,
    });

    expect(result.employees).toMatchObject({ total: 1, hasMore: false });
    const employee = result.employees.data[0];
    expect(employee.employeeProgressUrl).toMatch(
      /periodType=WEEK.*periodStart=2026-07-20.*department=.*status=COMPLETED/,
    );
    expect(employee.completedItems).toMatchObject({ total: 15, limit: 10, hasMore: true });
    expect(employee.completedItems.data).toHaveLength(10);
    expect(employee.nextPlans).toMatchObject({ total: 15, limit: 10, hasMore: true });
    expect(employee.nextPlans.data).toHaveLength(10);
    expect(employee.risks).toMatchObject({ total: 15, limit: 10, hasMore: true });
    expect(employee.risks.data).toHaveLength(10);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.project.findFirst).toHaveBeenCalledTimes(1);
  });

  it('reads employee metadata, facts, and source batches in one repeatable-read transaction', async () => {
    const service = createService();

    const result = await service.employee('employee-1', {
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      projectId: 'project-1',
    });

    expect(result.employee).toMatchObject({
      id: 'employee-1',
      displayName: '张三',
      workDirection: '平台研发',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      maxWait: 30_000,
      timeout: 120_000,
    });
    expect(prisma.resourceProfile.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.employeeWorkItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.employeeWorkImportBatch.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not publish physically present artifacts for expired drafts or EXPIRED batches', async () => {
    const expiredStatus = {
      id: 'batch-expired',
      periodType: EmployeeProgressPeriod.WEEK,
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      version: 1,
      status: EmployeeWorkImportStatus.EXPIRED,
      originalName: 'expired.xlsx',
      sourceStorageKey: 'employee-imports/batch-expired/source.xlsx',
      errorStorageKey: 'employee-imports/batch-expired/errors.xlsx',
      previewFingerprint: 'secret',
      expiresAt: new Date('2099-07-27T00:00:00.000Z'),
      archivedAt: new Date('2026-07-27T00:00:00.000Z'),
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      updatedAt: new Date('2026-07-27T00:00:00.000Z'),
    };
    const expiredDraft = {
      ...expiredStatus,
      id: 'batch-expired-draft',
      status: EmployeeWorkImportStatus.READY,
      sourceStorageKey: 'employee-imports/batch-expired-draft/source.xlsx',
      errorStorageKey: 'employee-imports/batch-expired-draft/errors.xlsx',
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      archivedAt: null,
    };
    prisma.employeeWorkImportBatch.findMany.mockResolvedValue([expiredStatus, expiredDraft]);
    prisma.employeeWorkImportBatch.count.mockResolvedValue(2);
    storage.stat.mockResolvedValue({ kind: 'FILE', size: 100 });
    const service = createService();

    const result = await service.listImports({ page: 1, pageSize: 20 });

    for (const [index, batch] of result.data.entries()) {
      expect(batch).toMatchObject({
        periodStart: '2026-07-20',
        periodEnd: '2026-07-26',
        sourceAvailable: false,
        errorAvailable: false,
        links: {
          self: `/employee-work-imports/${index === 0 ? 'batch-expired' : 'batch-expired-draft'}`,
        },
      });
      expect(batch).not.toHaveProperty('periodStartAt');
      expect(batch).not.toHaveProperty('periodEndAt');
      expect(batch.links).not.toHaveProperty('source');
      expect(batch.links).not.toHaveProperty('errors');
      expect(batch).not.toHaveProperty('sourceStorageKey');
    }
    expect(storage.stat).not.toHaveBeenCalled();
  });

  it('publishes only physically available artifacts for a live batch', async () => {
    prisma.employeeWorkImportBatch.findMany.mockResolvedValue([
      {
        id: 'batch-ready',
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
        version: 1,
        status: EmployeeWorkImportStatus.READY,
        originalName: 'ready.xlsx',
        sourceStorageKey: 'employee-imports/batch-ready/source.xlsx',
        errorStorageKey: 'employee-imports/batch-ready/errors.xlsx',
        previewFingerprint: 'secret',
        expiresAt: new Date('2099-07-27T00:00:00.000Z'),
        archivedAt: null,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ]);
    prisma.employeeWorkImportBatch.count.mockResolvedValue(1);
    storage.stat.mockImplementation(async (key: string) => {
      if (key.endsWith('/source.xlsx')) return { kind: 'FILE', size: 100 };
      throw new Error('missing');
    });
    const service = createService();

    const result = await service.listImports({ page: 1, pageSize: 20 });

    expect(result.data[0]).toMatchObject({
      sourceAvailable: true,
      errorAvailable: false,
      links: {
        source: '/employee-work-imports/batch-ready/source',
      },
    });
    expect(result.data[0].links).not.toHaveProperty('errors');
  });

  it('does not publish a restore link when the immutable source is unavailable', async () => {
    prisma.employeeWorkImportBatch.findMany.mockResolvedValue([
      {
        id: 'batch-completed',
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
        version: 1,
        status: EmployeeWorkImportStatus.COMPLETED,
        originalName: 'completed.xlsx',
        sourceStorageKey: 'employee-imports/batch-completed/source.xlsx',
        errorStorageKey: null,
        previewFingerprint: 'secret',
        expiresAt: new Date('2026-07-21T00:00:00.000Z'),
        archivedAt: null,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ]);
    prisma.employeeWorkImportBatch.count.mockResolvedValue(1);
    storage.stat.mockRejectedValue(new Error('missing'));
    const service = createService();

    const result = await service.listImports({ page: 1, pageSize: 20 });

    expect(result.data[0]).toMatchObject({
      sourceAvailable: false,
      links: { self: '/employee-work-imports/batch-completed' },
    });
    expect(result.data[0].links).not.toHaveProperty('restore');
  });

  it('filters import detail rows and totals by rowStatus and issuesOnly without changing defaults', async () => {
    const batch = {
      id: 'batch-detail',
      periodType: EmployeeProgressPeriod.WEEK,
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      version: 1,
      status: EmployeeWorkImportStatus.COMPLETED,
      originalName: 'detail.xlsx',
      sourceStorageKey: 'employee-imports/batch-detail/source.xlsx',
      errorStorageKey: null,
      previewFingerprint: 'secret',
      expiresAt: new Date('2026-07-21T00:00:00.000Z'),
      archivedAt: null,
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      updatedAt: new Date('2026-07-20T00:00:00.000Z'),
    };
    const issueRow = {
      id: 'row-issue',
      batchId: 'batch-detail',
      rowNumber: 1,
      sourceSheetName: '张三',
      sourceSection: 'NEXT_WEEK_PLAN',
      sourceRowNumber: 20,
      sourceKey: '张三:NEXT_WEEK_PLAN:20',
      workKind: EmployeeWorkKind.PROJECT,
      plannedHours: 6.5,
      actualHours: null,
      profileAction: 'UPDATE',
      riskDecision: 'KEEP',
      riskText: '依赖资源确认',
      rawValues: {},
      normalizedValues: {},
      status: EmployeeImportRowStatus.ERROR,
      errors: [{ field: 'employeeName', code: 'REQUIRED' }],
      resolvedEmployeeId: null,
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
      workItem: null,
      weekPlanItem: { id: 'plan-1', archivedAt: null },
    };
    prisma.employeeWorkImportBatch.findUnique.mockResolvedValue(batch);
    prisma.employeeWorkImportRow.findMany.mockResolvedValue([issueRow]);
    prisma.employeeWorkImportRow.count.mockResolvedValue(1);
    const service = createService();

    const filtered = await service.getImport('batch-detail', {
      rowsPage: 2,
      rowsPageSize: 10,
      rowStatus: EmployeeImportRowStatus.ERROR,
      issuesOnly: true,
    });

    const filteredWhere = {
      batchId: 'batch-detail',
      status: EmployeeImportRowStatus.ERROR,
      AND: [
        { status: { in: [EmployeeImportRowStatus.ERROR, EmployeeImportRowStatus.UNRESOLVED] } },
      ],
    };
    expect(prisma.employeeWorkImportRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: filteredWhere, skip: 10, take: 10 }),
    );
    expect(prisma.employeeWorkImportRow.count).toHaveBeenCalledWith({ where: filteredWhere });
    expect(filtered.rowMeta).toEqual({ page: 2, pageSize: 10, total: 1 });
    expect(filtered.rows[0]).toMatchObject({
      rowNumber: 1,
      sourceSheetName: '张三',
      sourceSection: 'NEXT_WEEK_PLAN',
      sourceRowNumber: 20,
      sourceKey: '张三:NEXT_WEEK_PLAN:20',
      workKind: EmployeeWorkKind.PROJECT,
      plannedHours: 6.5,
      actualHours: null,
      profileAction: 'UPDATE',
      riskDecision: 'KEEP',
      riskText: '依赖资源确认',
      weekPlanItemId: 'plan-1',
      links: {
        weekPlanItem: '/employee-week-plans/plan-1',
      },
    });

    await service.getImport('batch-detail');
    expect(prisma.employeeWorkImportRow.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { batchId: 'batch-detail' } }),
    );
    expect(prisma.employeeWorkImportRow.count).toHaveBeenLastCalledWith({
      where: { batchId: 'batch-detail' },
    });
  });
});
