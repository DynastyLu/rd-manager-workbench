import {
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
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
      employee: { displayName: '张三', department: '研发部' },
      project: { code: 'RD-026', name: '工作台' },
      task: { code: 'TASK-026', title: '导出' },
      importBatch: { version: 2 },
    },
    {
      id: 'work-2',
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      title: '普通工作',
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
      employee: { displayName: '李四', department: null },
      project: null,
      task: null,
      importBatch: { version: 3 },
    },
  ];
  const prisma = {
    employeeWorkItem: { findMany: jest.fn() },
  };
  const audit = { record: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.employeeWorkItem.findMany.mockResolvedValue(items);
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
    expect(result.rowCount).toBe(2);
    expect(result.sourceBatchIds).toEqual(['batch-2', 'batch-3']);
    const csv = result.content.toString('utf8');
    expect(csv.startsWith('\uFEFF员工姓名,部门,周期开始')).toBe(true);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain(`'+危险计划`);
    expect(csv).toContain(`'-危险下期`);
    expect(csv).toContain(`'@危险风险`);
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
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WORK_EXPORTED',
        outcome: 'SUCCEEDED',
        metadata: expect.objectContaining({ format: 'csv', rowCount: 2 }),
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
    expect(headerRow?.cellCount).toBe(17);
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
