import { EmployeeProgressPeriod, EmployeeWorkImportStatus } from '@prisma/client';
import { EmployeesSearchAdapter } from '../../../../src/modules/workbench/search/adapters/employees-search.adapter';

describe('EmployeesSearchAdapter', () => {
  const prisma = {
    resourceProfile: { findMany: jest.fn() },
    employeeWorkItem: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.resourceProfile.findMany.mockResolvedValue([
      {
        id: 'employee/1',
        displayName: '权限平台主管',
        department: '研发平台',
        roleTitle: '高级工程师',
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
        employee: { displayName: '权限平台主管', department: '研发平台' },
        project: { code: 'RD-026', name: '权限平台' },
        task: { code: 'TASK-026', title: '权限模型' },
      },
    ]);
  });

  it('finds active employees and only confirmed current work content with safe paths', async () => {
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
          path: '/employees/employee%2F1?periodType=WEEK&periodStart=2026-07-20&workItemId=work%3F1',
        }),
      ]),
    );
    expect(prisma.resourceProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null }),
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
  });
});
