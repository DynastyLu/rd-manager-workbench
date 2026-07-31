import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import { ReportsService } from '../../../../src/modules/workbench/reporting/application/reports.service';
import { AuditLogService } from '../../../../src/modules/workbench/governance/application/audit-log.service';
import ExcelJS from 'exceljs';

const mockPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'tester',
  sessionId: 'session-1',
  roleCodes: ['EMPLOYEE'],
  permissions: [],
  permissionVersion: 1,
  mustChangePassword: false,
};
const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue(mockPrincipal),
} as unknown as RequestContextService;
const mockDataScope = {
  projects: jest.fn().mockReturnValue({}),
  tasks: jest.fn().mockReturnValue({}),
  employees: jest.fn().mockReturnValue({}),
  employeeWork: jest.fn().mockReturnValue({}),
  meetings: jest.fn().mockReturnValue({}),
  documents: jest.fn().mockReturnValue({}),
  knowledge: jest.fn().mockReturnValue({}),
  decisions: jest.fn().mockReturnValue({}),
  issues: jest.fn().mockReturnValue({}),
  risks: jest.fn().mockReturnValue({}),
  intelligenceItems: jest.fn().mockReturnValue({}),
  partners: jest.fn().mockReturnValue({}),
  communications: jest.fn().mockReturnValue({}),
  baseTables: jest.fn().mockReturnValue({}),
  baseRecords: jest.fn().mockReturnValue({}),
  activities: jest.fn().mockReturnValue({}),
} as unknown as DataScopeService;

describe('ReportsService', () => {
  const prisma = {
    $transaction: jest.fn((values: Array<Promise<unknown>>) => Promise.all(values)),
    project: { findMany: jest.fn() },
    workTask: { findMany: jest.fn() },
    risk: { findMany: jest.fn() },
    resourceProfile: { findMany: jest.fn() },
    intelligenceItem: { findMany: jest.fn() },
  } as unknown as PlatformPrismaService;
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.project.findMany as jest.Mock).mockResolvedValue([{
      id: 'project-1', code: 'P-1', name: '平台升级', status: 'ACTIVE', phase: 'EXECUTION',
      milestones: [{ status: 'COMPLETED' }, { status: 'PENDING' }],
      tasks: [{ status: 'TODO', dueAt: new Date('2026-07-10'), completedAt: null }],
      risks: [{ status: 'OPEN', level: 'HIGH' }],
      healthSnapshots: [{ health: 'RED' }],
    }]);
    (prisma.workTask.findMany as jest.Mock).mockResolvedValue([
      { status: 'DONE', dueAt: new Date('2026-07-10'), completedAt: new Date('2026-07-09'), createdAt: new Date('2026-07-01') },
      { status: 'TODO', dueAt: new Date('2026-07-12'), completedAt: null, createdAt: new Date('2026-07-02') },
    ]);
    (prisma.risk.findMany as jest.Mock).mockResolvedValue([
      { status: 'OPEN', level: 'HIGH', createdAt: new Date('2026-07-03'), closedAt: null },
      { status: 'CLOSED', level: 'LOW', createdAt: new Date('2026-07-04'), closedAt: new Date('2026-07-11') },
    ]);
    (prisma.resourceProfile.findMany as jest.Mock).mockResolvedValue([{
      weeklyCapacityHours: 40,
      loadEntries: [{ plannedHours: { toString: () => '50' }, weekStartAt: new Date('2026-07-06') }],
    }]);
    (prisma.intelligenceItem.findMany as jest.Mock).mockResolvedValue([{
      id: 'intel-1', title: 'AI policy', status: 'REVIEWED', priority: 'HIGH', createdAt: new Date('2026-07-04'),
      topics: [{ topic: { name: 'AI' } }],
      occurrences: [{ source: { name: '政策网站' } }],
      conversions: [{ kind: 'TASK' }],
    }]);
  });

  it('builds project portfolio health, phase, milestone, overdue-task and high-risk metrics', async () => {
    const result = await new ReportsService(prisma, mockDataScope, mockRequestContext, audit).portfolio({ from: '2026-07-06', to: '2026-07-12', bucket: 'WEEK' });
    expect(result).toEqual(expect.objectContaining({
      total: 1,
      byStatus: { ACTIVE: 1 },
      byPhase: { EXECUTION: 1 },
      byHealth: { RED: 1 },
      milestones: { total: 2, achieved: 1 },
      overdueTasks: 1,
      highOrCriticalRisks: 1,
    }));
    expect(result.rows[0]).toEqual(expect.objectContaining({ health: 'RED', milestonePercent: 50, overdueTasks: 1, highOrCriticalRisks: 1 }));
  });

  it('reports task creation/completion and risk creation/closure in UTC buckets', async () => {
    const service = new ReportsService(prisma, mockDataScope, mockRequestContext, audit);
    const tasks = await service.taskCompletionTrend({ from: '2026-07-01', to: '2026-07-31', bucket: 'WEEK' });
    const risks = await service.riskTrend({ from: '2026-07-01', to: '2026-07-31', bucket: 'WEEK' });
    expect(tasks.buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({ bucket: '2026-06-29', created: 2 }),
      expect.objectContaining({ bucket: '2026-07-06', completed: 1 }),
    ]));
    expect(risks.buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({ bucket: '2026-06-29', created: 2 }),
      expect.objectContaining({ bucket: '2026-07-06', closed: 1 }),
    ]));
  });

  it('reports resource weeks and intelligence topic/source/priority/conversion breakdowns', async () => {
    const service = new ReportsService(prisma, mockDataScope, mockRequestContext, audit);
    const resources = await service.resourceLoad({ from: '2026-07-06', to: '2026-07-12', bucket: 'WEEK' });
    const intelligence = await service.intelligence({ from: '2026-07-01', to: '2026-07-31', bucket: 'WEEK' });
    expect(resources).toEqual(expect.objectContaining({ plannedHours: 50, capacityHours: 40, utilizationPercent: 125, overloadedResources: 1 }));
    expect(resources.weeks).toEqual([expect.objectContaining({ weekStartAt: '2026-07-06', utilizationPercent: 125, overloaded: true })]);
    expect(intelligence).toEqual(expect.objectContaining({
      byTopic: { AI: 1 }, bySource: { '政策网站': 1 }, byPriority: { HIGH: 1 }, byConversionKind: { TASK: 1 },
    }));
  });

  it('normalizes ordinary report dates to inclusive UTC Monday boundaries for resource load', async () => {
    const result = await new ReportsService(prisma, mockDataScope, mockRequestContext, audit).resourceLoad({
      from: '2026-07-08',
      to: '2026-07-21',
      bucket: 'MONTH',
    });

    expect(result).toMatchObject({ fromWeek: '2026-07-06', toWeek: '2026-07-20' });
    expect(prisma.resourceProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        loadEntries: expect.objectContaining({
          where: expect.objectContaining({
            weekStartAt: {
              gte: new Date('2026-07-06T00:00:00.000Z'),
              lte: new Date('2026-07-20T00:00:00.000Z'),
            },
          }),
        }),
      }),
    }));
  });

  it('detects resource overload from the sum of entries in a week', async () => {
    (prisma.resourceProfile.findMany as jest.Mock).mockResolvedValue([{
      id: 'resource-1', displayName: '张三', weeklyCapacityHours: 40,
      loadEntries: [
        { plannedHours: 25, weekStartAt: new Date('2026-07-06') },
        { plannedHours: 25, weekStartAt: new Date('2026-07-06') },
      ],
    }]);
    const result = await new ReportsService(prisma, mockDataScope, mockRequestContext, audit).resourceLoad({ fromWeek: '2026-07-06', toWeek: '2026-07-06' });
    expect(result.overloadedResources).toBe(1);
    expect(result.rows[0].overloaded).toBe(true);
  });

  it('rejects a range longer than 366 days before querying', async () => {
    await expect(new ReportsService(prisma, mockDataScope, mockRequestContext, audit).portfolio({ from: '2025-01-01', to: '2026-07-31', bucket: 'MONTH' }))
      .rejects.toMatchObject({ code: 'REPORT_RANGE_INVALID', statusCode: 422 });
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it('exports the same report rows to safe CSV and XLSX and writes immutable audit', async () => {
    const service = new ReportsService(prisma, mockDataScope, mockRequestContext, audit);
    const csv = await service.exportReport({ kind: 'TASKS', format: 'CSV', from: '2026-07-01', to: '2026-07-31', bucket: 'WEEK' });
    const xlsx = await service.exportReport({ kind: 'TASKS', format: 'XLSX', from: '2026-07-01', to: '2026-07-31', bucket: 'WEEK' });
    expect(csv.content.toString()).toContain('\uFEFF周期,新建任务,完成任务');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.content as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const xlsxRows = workbook.worksheets[0].getSheetValues().slice(1).map((row) => (row as unknown[]).slice(1).join(','));
    const csvRows = csv.content.toString().replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(xlsxRows).toEqual(csvRows);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'REPORT_EXPORT', outcome: 'SUCCEEDED', entityType: 'report', entityId: 'TASKS' }));
  });
});
