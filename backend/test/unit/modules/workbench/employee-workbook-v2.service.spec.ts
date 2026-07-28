import { EmployeeWorkStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { EmployeeWorkbookV2Service } from '../../../../src/modules/workbench/employees/application/employee-workbook-v2.service';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';

const PERIOD_START = '2026-07-20';
const EMPLOYEES = [
  { employeeName: '匿名员工甲', department: '平台组', workDirection: '工程效率' },
  { employeeName: '匿名员工乙', department: '产品组', workDirection: null },
] as const;

describe('EmployeeWorkbookV2Service', () => {
  const v2 = new EmployeeWorkbookV2Service();
  const service = new EmployeeWorkbookService();

  async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return workbook;
  }

  async function save(workbook: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async function workbook(): Promise<ExcelJS.Workbook> {
    return load(await v2.template({ periodStart: PERIOD_START, employees: [...EMPLOYEES] }));
  }

  it('generates a V2 template dynamically from anonymous employees', async () => {
    const generated = await workbook();

    expect(generated.worksheets.map(({ name }) => name)).toEqual([
      '填写说明',
      '匿名员工甲',
      '匿名员工乙',
    ]);
    expect(generated.getWorksheet('填写说明')?.getCell('B2').value).toBe(2);
    const employee = generated.getWorksheet('匿名员工甲')!;
    expect(employee.getCell('B1').value).toBe('匿名员工甲');
    expect(employee.getCell('D1').value).toBe('平台组');
    expect(employee.getCell('F1').value).toBe('工程效率');
    expect(employee.getCell('B2').value).toEqual(new Date('2026-07-20T00:00:00.000Z'));
    expect(employee.getCell('D2').value).toEqual(new Date('2026-07-26T00:00:00.000Z'));
    expect(employee.getRow(6).values).toEqual([
      undefined,
      '序号',
      '本周工作内容',
      '具体任务 / 预期交付',
      '计划完成日期',
      '状态',
      '完成进度',
      '本周成果 / 问题',
      '下周计划',
    ]);
    expect(employee.getRow(19).values).toEqual([
      undefined,
      '序号',
      '下周重点工作',
      '具体任务 / 预期交付',
      '计划完成日期',
      '优先级',
      '所需协作 / 资源',
      '计划说明',
      '备注',
    ]);
    expect(employee.getCell('E7').value).toBe('未开始');
    expect(employee.getCell('F7').value).toBe(0);
  });

  it('rejects a timezone-shifted Date when generating a template', async () => {
    await expect(
      v2.template({
        periodStart: new Date('2026-07-20T08:00:00.000Z'),
        employees: [...EMPLOYEES],
      }),
    ).rejects.toThrow(/时间|时区|midnight/i);
  });

  it('parses metadata, current work, next-week plans, and exact source coordinates', async () => {
    const generated = await workbook();
    const current = generated.getWorksheet('匿名员工甲')!;
    current.getRow(7).values = [
      1,
      '实现格式探测',
      '覆盖两种协议',
      new Date('2026-07-24T00:00:00.000Z'),
      '进行中',
      0.75,
      '已完成核心路径',
      '补齐异常用例',
    ];
    current.getCell('F7').numFmt = '0%';
    current.getRow(20).values = [
      1,
      '完善导入预览',
      '展示来源坐标',
      new Date('2026-07-31T00:00:00.000Z'),
      '高',
      '需要测试同学协作',
      '先完成接口再联调',
      '匿名数据',
    ];

    const result = await service.inspect(await save(generated));

    expect(result.meta).toEqual({
      templateVersion: 2,
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      nextPeriodStart: '2026-07-27',
      nextPeriodEnd: '2026-08-02',
      employeeSheetCount: 2,
    });
    expect(result.rows).toEqual([
      expect.objectContaining({
        sourceSection: 'CURRENT_WORK',
        rowNumber: 1,
        sourceSheetName: '匿名员工甲',
        sourceRowNumber: 7,
        employeeName: '匿名员工甲',
        department: '平台组',
        workDirection: '工程效率',
        title: '实现格式探测',
        planText: '覆盖两种协议',
        plannedCompletionAt: '2026-07-24',
        status: EmployeeWorkStatus.IN_PROGRESS,
        completionRate: 75,
        summaryText: '已完成核心路径',
        nextPlanText: '补齐异常用例',
      }),
      expect.objectContaining({
        sourceSection: 'NEXT_WEEK_PLAN',
        rowNumber: 2,
        sourceSheetName: '匿名员工甲',
        sourceRowNumber: 20,
        employeeName: '匿名员工甲',
        title: '完善导入预览',
        deliverableText: '展示来源坐标',
        plannedCompletionAt: '2026-07-31',
        priority: 'HIGH',
        collaborationText: '需要测试同学协作',
        planText: '先完成接口再联调',
        note: '匿名数据',
      }),
    ]);
    expect(result.sourceRows).toEqual([
      expect.objectContaining({
        rowNumber: 1,
        sourceSheetName: '匿名员工甲',
        sourceSection: 'CURRENT_WORK',
        sourceRowNumber: 7,
      }),
      expect.objectContaining({
        rowNumber: 2,
        sourceSheetName: '匿名员工甲',
        sourceSection: 'NEXT_WEEK_PLAN',
        sourceRowNumber: 20,
      }),
    ]);
  });

  it('ignores untouched current and next template rows plus automatic summaries', async () => {
    const result = await service.inspect(await save(await workbook()));

    expect(result.rows).toEqual([]);
    expect(result.sourceRows).toEqual([]);
  });

  it('rejects employee identity mismatches across directory, sheet name, and metadata', async () => {
    const generated = await workbook();
    generated.getWorksheet('匿名员工甲')!.getCell('B1').value = '匿名员工乙';

    await expect(service.parse(await save(generated))).rejects.toThrow(/三方一致|身份/);
  });

  it('rejects mixed employee-sheet periods', async () => {
    const generated = await workbook();
    generated.getWorksheet('匿名员工乙')!.getCell('B2').value = new Date(
      '2026-07-27T00:00:00.000Z',
    );
    generated.getWorksheet('匿名员工乙')!.getCell('D2').value = new Date(
      '2026-08-02T00:00:00.000Z',
    );

    await expect(service.parse(await save(generated))).rejects.toThrow(/同一周|周期/);
  });

  it('rejects formulas in editable current and next-week cells with source context', async () => {
    const generated = await workbook();
    generated.getWorksheet('匿名员工甲')!.getCell('B7').value = {
      formula: '"伪造工作"',
      result: '伪造工作',
    };
    generated.getWorksheet('匿名员工乙')!.getCell('B20').value = {
      formula: '"伪造计划"',
      result: '伪造计划',
    };

    const parsed = service.parse(await save(generated));
    await expect(parsed).rejects.toThrow(/匿名员工甲.*CURRENT_WORK.*7/);
    await expect(parsed).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            sourceSheetName: '匿名员工甲',
            sourceSection: 'CURRENT_WORK',
            sourceRowNumber: 7,
            code: 'FORMULA_NOT_ALLOWED',
          }),
          expect.objectContaining({
            sourceSheetName: '匿名员工乙',
            sourceSection: 'NEXT_WEEK_PLAN',
            sourceRowNumber: 20,
            code: 'FORMULA_NOT_ALLOWED',
          }),
        ]),
      },
    });
  });

  it('allows only the generated metadata formulas, not cached external references', async () => {
    const generated = await workbook();
    generated.getWorksheet('匿名员工甲')!.getCell('B3').value = {
      formula: '[external.xlsx]Sheet1!A1',
      result: new Date('2026-07-27T00:00:00.000Z'),
    };

    await expect(service.parse(await save(generated))).rejects.toThrow(/公式|formula|external/i);
  });

  it('wraps formulas in the employee directory as template validation errors', async () => {
    const generated = await workbook();
    generated.getWorksheet('填写说明')!.getCell('B5').value = {
      formula: '"伪造部门"',
      result: '伪造部门',
    };

    await expect(service.parse(await save(generated))).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      statusCode: 422,
    });
  });

  it('collects invalid status, progress, priority, and partial-row issues', async () => {
    const generated = await workbook();
    generated.getWorksheet('匿名员工甲')!.getRow(7).values = [
      1,
      null,
      '缺少标题',
      null,
      '未知状态',
      '101%',
      null,
      null,
    ];
    generated.getWorksheet('匿名员工乙')!.getRow(20).values = [
      1,
      null,
      '缺少标题',
      null,
      '最高',
      null,
      null,
      null,
    ];

    const result = await service.inspect(await save(generated));

    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSheetName: '匿名员工甲',
          sourceSection: 'CURRENT_WORK',
          sourceRowNumber: 7,
          field: '本周工作内容',
          code: 'REQUIRED_FIELD',
        }),
        expect.objectContaining({
          sourceSheetName: '匿名员工甲',
          field: '状态',
          code: 'INVALID_VALUE',
        }),
        expect.objectContaining({
          sourceSheetName: '匿名员工甲',
          field: '完成进度',
          code: 'INVALID_VALUE',
        }),
        expect.objectContaining({
          sourceSheetName: '匿名员工乙',
          sourceSection: 'NEXT_WEEK_PLAN',
          sourceRowNumber: 20,
          field: '优先级',
          code: 'INVALID_VALUE',
        }),
      ]),
    );
  });

  it('reports directory/profile differences as non-blocking warnings', async () => {
    const generated = await workbook();
    generated.getWorksheet('填写说明')!.getCell('B5').value = '匿名其他组';

    const result = await service.inspect(await save(generated));

    expect(result.issues).toEqual([]);
    expect(result.profileWarnings).toEqual([
      expect.objectContaining({
        employeeName: '匿名员工甲',
        sourceSheetName: '匿名员工甲',
        field: 'department',
        instructionValue: '匿名其他组',
        sheetValue: '平台组',
      }),
    ]);
  });
});
