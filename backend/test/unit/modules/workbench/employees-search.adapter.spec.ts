import { EmployeeProgressPeriod, EmployeeWorkImportStatus } from '@prisma/client';
import { EmployeesSearchAdapter } from '../../../../src/modules/workbench/search/adapters/employees-search.adapter';

describe('EmployeesSearchAdapter', () => {
  const prisma = {
    resourceProfile: { findMany: jest.fn() },
    employeeWorkItem: { findMany: jest.fn() },
    employeeWeekPlanItem: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.resourceProfile.findMany.mockResolvedValue([
      {
        id: 'employee/1',
        displayName: '权限平台主管',
        department: '研发平台',
        roleTitle: '高级工程师',
        workDirection: '基础平台',
        updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ]);
    prisma.employeeWorkItem.findMany.mockResolvedValue([
      {
        id: 'work?1',
        title: '完成权限模型',
        planText: '实现权限边界',
        summaryText: '权限接口已联调',
        nextPlanText: '权限回归',
        riskText: null,
        note: null,
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        employeeId: 'employee/1',
        updatedAt: new Date('2026-07-21T00:00:00.000Z'),
        employee: {
          displayName: '权限平台主管',
          department: '研发平台',
          workDirection: '基础平台',
        },
        project: { id: 'project-1', code: 'RD-026', name: '权限平台' },
        task: { code: 'TASK-026', title: '权限模型' },
        sourceRow: {
          sourceSheetName: '权限平台主管',
          sourceSection: 'CURRENT_WORK',
          sourceRowNumber: 8,
        },
      },
    ]);
    prisma.employeeWeekPlanItem.findMany.mockResolvedValue([
      {
        id: 'plan?1',
        title: '权限灰度发布',
        deliverableText: '权限服务灰度上线',
        collaborationText: '需要运维配合',
        planText: '完成灰度与观测',
        note: '关注回滚演练',
        periodStartAt: new Date('2026-07-27T00:00:00.000Z'),
        periodEndAt: new Date('2026-08-02T00:00:00.000Z'),
        employeeId: 'employee/1',
        updatedAt: new Date('2026-07-22T00:00:00.000Z'),
        employee: {
          displayName: '权限平台主管',
          department: '研发平台',
          workDirection: '基础平台',
        },
        project: { id: 'project-1', code: 'RD-026', name: '权限平台' },
        task: { code: 'TASK-027', title: '权限发布' },
        sourceRow: {
          sourceSheetName: '权限平台主管',
          sourceSection: 'NEXT_WEEK_PLAN',
          sourceRowNumber: 23,
        },
      },
    ]);
  });

  it('finds current work and future plans with explicit result and source coordinates', async () => {
    const adapter = new EmployeesSearchAdapter(prisma as never);

    const hits = await adapter.search('权限', ['EMPLOYEE', 'EMPLOYEE_WORK']);

    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'EMPLOYEE',
          id: 'employee/1',
          path: '/employees/employee%2F1',
        }),
        expect.objectContaining({
          type: 'EMPLOYEE_WORK',
          id: 'work?1',
          title: '当前工作｜完成权限模型',
          snippet: expect.stringContaining('基础平台'),
          path: '/employees/employee%2F1?periodType=WEEK&periodStart=2026-07-20&sourceSection=CURRENT_WORK&workItemId=work%3F1&sourceSheet=%E6%9D%83%E9%99%90%E5%B9%B3%E5%8F%B0%E4%B8%BB%E7%AE%A1&sourceRow=8',
        }),
        expect.objectContaining({
          type: 'EMPLOYEE_WORK',
          id: 'plan?1',
          title: '未来计划｜权限灰度发布',
          snippet: expect.stringContaining('需要运维配合'),
          path: '/employees/employee%2F1?periodType=WEEK&periodStart=2026-07-27&sourceSection=NEXT_WEEK_PLAN&planItemId=plan%3F1&sourceSheet=%E6%9D%83%E9%99%90%E5%B9%B3%E5%8F%B0%E4%B8%BB%E7%AE%A1&sourceRow=23',
        }),
      ]),
    );
    expect(prisma.resourceProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          OR: expect.arrayContaining([
            { workDirection: { contains: '权限', mode: 'insensitive' } },
          ]),
        }),
        take: 100,
      }),
    );
    expect(prisma.employeeWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          employee: { archivedAt: null },
          importBatch: {
            periodType: EmployeeProgressPeriod.WEEK,
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
          },
          OR: expect.arrayContaining([
            {
              employee: {
                workDirection: { contains: '权限', mode: 'insensitive' },
              },
            },
          ]),
        }),
        select: expect.not.objectContaining({ rawRow: true }),
        take: 100,
      }),
    );
    expect(prisma.employeeWeekPlanItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          employee: { archivedAt: null },
          importBatch: {
            periodType: EmployeeProgressPeriod.WEEK,
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
          },
        }),
        select: expect.not.objectContaining({ rawRow: true }),
        take: 100,
      }),
    );
  });

  it('does not query unrequested employee search types', async () => {
    const adapter = new EmployeesSearchAdapter(prisma as never);

    await expect(adapter.search('权限', ['PROJECT'])).resolves.toEqual([]);

    expect(prisma.resourceProfile.findMany).not.toHaveBeenCalled();
    expect(prisma.employeeWorkItem.findMany).not.toHaveBeenCalled();
    expect(prisma.employeeWeekPlanItem.findMany).not.toHaveBeenCalled();
  });
});
