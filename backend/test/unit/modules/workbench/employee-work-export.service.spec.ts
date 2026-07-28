import {
  EmployeeProgressPeriod,
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  EmployeeWorkStatus,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { EmployeeWorkExportService } from '../../../../src/modules/workbench/employees/application/employee-work-export.service';

describe('EmployeeWorkExportService', () => {
  const items = [
    {
      id: 'work-1',
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      title: '=HYPERLINK("https://example.invalid")',
      workKind: EmployeeWorkKind.PROJECT,
      plannedCompletionAt: new Date('2026-07-24T00:00:00.000Z'),
      planText: '+危险计划',
      summaryText: '已完成',
      completionRate: 75,
      status: EmployeeWorkStatus.AT_RISK,
      nextPlanText: '-危险下期',
      riskText: '@危险风险',
      plannedHours: 8,
      actualHours: 7,
      note: null,
      importBatchId: 'batch-2',
      employee: { displayName: '张三', department: '研发部', workDirection: '工程效率' },
      projectId: 'project-1',
      project: { id: 'project-1', code: 'RD-026', name: '工作台' },
      taskId: 'task-1',
      task: { id: 'task-1', code: 'TASK-026', title: '导出' },
      sourceRowId: 'source-row-1',
      sourceRow: {
        sourceSheetName: '张三',
        sourceSection: 'CURRENT_WORK',
        sourceRowNumber: 8,
      },
      importBatch: { version: 2 },
    },
    {
      id: 'work-2',
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      title: '普通工作',
      workKind: EmployeeWorkKind.NON_PROJECT,
      plannedCompletionAt: null,
      planText: null,
      summaryText: null,
      completionRate: null,
      status: EmployeeWorkStatus.BLOCKED,
      nextPlanText: null,
      riskText: '等待依赖',
      plannedHours: null,
      actualHours: null,
      note: null,
      importBatchId: 'batch-3',
      employee: { displayName: '李四', department: null, workDirection: '技术预研' },
      projectId: null,
      project: null,
      taskId: null,
      task: null,
      sourceRowId: 'source-row-2',
      sourceRow: {
        sourceSheetName: '李四',
        sourceSection: 'CURRENT_WORK',
        sourceRowNumber: 9,
      },
      importBatch: { version: 3 },
    },
  ];
  const planItems = [
    {
      id: 'plan-1',
      periodStartAt: new Date('2026-07-27T00:00:00.000Z'),
      periodEndAt: new Date('2026-08-02T00:00:00.000Z'),
      title: '灰度发布',
      deliverableText: '发布报告',
      plannedCompletionAt: new Date('2026-07-31T00:00:00.000Z'),
      priority: EmployeePlanPriority.HIGH,
      collaborationText: '运维协作',
      planText: '分批灰度',
      note: '可回滚',
      workKind: EmployeeWorkKind.PROJECT,
      carryStatus: EmployeePlanCarryStatus.PLANNED,
      cancelReason: null,
      importBatchId: 'batch-2',
      employee: { displayName: '张三', department: '研发部', workDirection: '工程效率' },
      projectId: 'project-1',
      project: { id: 'project-1', code: 'RD-026', name: '工作台' },
      taskId: 'task-2',
      task: { id: 'task-2', code: 'TASK-027', title: '灰度发布' },
      sourceRowId: 'source-row-3',
      sourceRow: {
        sourceSheetName: '张三',
        sourceSection: 'NEXT_WEEK_PLAN',
        sourceRowNumber: 23,
      },
    },
  ];
  const prisma = {
    employeeWorkItem: { findMany: jest.fn() },
    employeeWeekPlanItem: { findMany: jest.fn() },
  };
  const audit = { record: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.employeeWorkItem.findMany.mockResolvedValue(items);
    prisma.employeeWeekPlanItem.findMany.mockResolvedValue(planItems);
    audit.record.mockResolvedValue({});
  });

  const createService = () =>
    new (EmployeeWorkExportService as unknown as new (
      prisma: unknown,
      audit: unknown,
    ) => EmployeeWorkExportService)(prisma, audit);

  it('exports every current filtered row as formula-safe UTF-8 CSV', async () => {
    const service = createService();

    const result = await service.export({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      employeeId: 'employee-1',
      department: '研发部',
      projectId: 'project-1',
      status: EmployeeWorkStatus.AT_RISK,
      format: 'csv',
    });

    expect(result.extension).toBe('csv');
    expect(result.rowCount).toBe(3);
    expect(result.sourceBatchIds).toEqual(['batch-2', 'batch-3']);
    const csv = result.content.toString('utf8');
    expect(csv.startsWith('\uFEFF员工姓名,部门,周期开始')).toBe(true);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain(`'+危险计划`);
    expect(csv).toContain(`'-危险下期`);
    expect(csv).toContain(`'@危险风险`);
    expect(csv).toContain(
      '来源类型,周期结束,工作方向,系统分类,计划完成日期,交付物,优先级,协作需求,未来计划,计划流转状态,取消原因,项目ID,任务ID,任务名称,工时风险,来源工作表,来源区段,来源行号,来源记录ID',
    );
    expect(csv).toContain(
      '张三,研发部,2026-07-27,灰度发布,,,,,,,,,RD-026,工作台,TASK-027,batch-2,可回滚,未来计划,2026-08-02,工程效率,PROJECT,2026-07-31,发布报告,HIGH,运维协作,分批灰度,PLANNED,,project-1,task-2,灰度发布,,张三,NEXT_WEEK_PLAN,23,source-row-3',
    );
    expect(prisma.employeeWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          periodEndAt: {
            gte: new Date('2026-07-20T00:00:00.000Z'),
            lte: new Date('2026-07-26T00:00:00.000Z'),
          },
          periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
          employeeId: 'employee-1',
          projectId: 'project-1',
          status: EmployeeWorkStatus.AT_RISK,
          employee: { archivedAt: null, department: '研发部' },
          importBatch: {
            periodType: EmployeeProgressPeriod.WEEK,
            periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
            periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
          },
        },
        select: expect.not.objectContaining({ rawRow: true }),
      }),
    );
    expect(prisma.employeeWeekPlanItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          employeeId: 'employee-1',
          projectId: 'project-1',
          employee: { archivedAt: null, department: '研发部' },
          importBatch: expect.objectContaining({
            periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
          }),
        }),
        select: expect.not.objectContaining({ rawRow: true }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WORK_EXPORTED',
        outcome: 'SUCCEEDED',
        metadata: expect.objectContaining({ format: 'csv', rowCount: 3 }),
      }),
    );
  });

  it('exports formula-safe XLSX cells and audits failed exports', async () => {
    const service = createService();
    const result = await service.export({
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      format: 'xlsx',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.content as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('员工工作明细');

    expect(result.extension).toBe('xlsx');
    expect(sheet?.getCell('D2').value).toBe(`'=HYPERLINK("https://example.invalid")`);
    expect(sheet?.getCell('E2').value).toBe(`'+危险计划`);
    expect(sheet?.getCell('J2').value).toBe(`'@危险风险`);
    // Column widths must stay aligned with the header row (no positional drift).
    const headerRow = sheet?.getRow(1);
    expect(headerRow?.cellCount).toBe(36);
    headerRow?.eachCell((_, colNumber) => {
      expect(sheet?.getColumn(colNumber).width).toBeGreaterThan(0);
    });

    prisma.employeeWorkItem.findMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      service.export({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: '2026-07-20',
        format: 'xlsx',
      }),
    ).rejects.toThrow('database unavailable');
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WORK_EXPORT_FAILED',
        outcome: 'FAILED',
        metadata: expect.objectContaining({ format: 'xlsx', rowCount: 0 }),
      }),
    );
  });

  it('uses the same overlapping current-week facts as monthly progress filters', async () => {
    const service = createService();

    await service.export({
      periodType: EmployeeProgressPeriod.MONTH,
      periodStart: '2026-07-01',
      format: 'csv',
    });

    expect(prisma.employeeWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodEndAt: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lte: new Date('2026-07-31T00:00:00.000Z'),
          },
          importBatch: expect.objectContaining({
            periodStartAt: {
              gte: new Date('2026-06-29T00:00:00.000Z'),
              lte: new Date('2026-07-31T00:00:00.000Z'),
            },
          }),
        }),
      }),
    );
  });
});
