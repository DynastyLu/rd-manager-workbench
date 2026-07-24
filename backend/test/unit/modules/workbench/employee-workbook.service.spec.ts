import { EmployeeWorkStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';

const HEADERS = [
  '员工姓名',
  '工作内容',
  '本期计划',
  '本期完成情况',
  '完成度',
  '工作状态',
  '下期计划',
  '风险与阻塞',
  '计划工时',
  '实际工时',
  '项目编号',
  '任务编号',
  '备注',
] as const;

const VALID_START = new Date(Date.UTC(2026, 6, 20));
const VALID_END = new Date(Date.UTC(2026, 6, 26));
const MAX_FILE_SIZE = 20 * 1024 * 1024;

describe('EmployeeWorkbookService', () => {
  const service = new EmployeeWorkbookService();

  jest.setTimeout(60_000);

  async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return workbook;
  }

  async function saveWorkbook(workbook: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async function validTemplateWorkbook(): Promise<ExcelJS.Workbook> {
    const workbook = await loadWorkbook(await service.template());
    const instructions = workbook.getWorksheet('说明');
    if (!instructions) throw new Error('说明 sheet missing from generated template');
    instructions.getCell('B4').value = VALID_START;
    instructions.getCell('B5').value = VALID_END;
    return workbook;
  }

  function detailSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
    const sheet = workbook.getWorksheet('工作明细');
    if (!sheet) throw new Error('工作明细 sheet missing');
    return sheet;
  }

  async function parseWorkbook(workbook: ExcelJS.Workbook) {
    return service.parse(await saveWorkbook(workbook));
  }

  function addValidRow(
    workbook: ExcelJS.Workbook,
    overrides: Partial<Record<(typeof HEADERS)[number], ExcelJS.CellValue>> = {},
  ): ExcelJS.Row {
    const values: ExcelJS.CellValue[] = [
      ' 张三 ',
      ' 实现员工周报导入 ',
      ' 完成接口设计 ',
      ' 已完成开发 ',
      90,
      '进行中',
      ' 联调 ',
      null,
      8,
      7.5,
      ' P-001 ',
      ' T-001 ',
      ' 正常 ',
    ];
    for (const [header, value] of Object.entries(overrides)) {
      values[HEADERS.indexOf(header as (typeof HEADERS)[number])] = value ?? null;
    }
    return detailSheet(workbook).addRow(values);
  }

  async function expectInvalid(workbook: ExcelJS.Workbook, message?: RegExp) {
    const promise = parseWorkbook(workbook);
    await expect(promise).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      statusCode: 422,
    });
    if (message) await expect(promise).rejects.toThrow(message);
  }

  it('generates the exact two-sheet template with metadata, layout, and validations', async () => {
    const workbook = await loadWorkbook(await service.template());

    expect(workbook.worksheets.map(({ name }) => name)).toEqual(['说明', '工作明细']);
    const instructions = workbook.getWorksheet('说明');
    const details = workbook.getWorksheet('工作明细');
    expect(instructions).toBeDefined();
    expect(details).toBeDefined();
    expect(instructions?.getCell('B1').value).toBe('周计划与总结');
    expect(instructions?.getCell('B2').value).toBe('WEEK');
    expect(instructions?.getCell('B3').value).toBe(1);
    expect(instructions?.getCell('A4').value).toBe('周期开始日期');
    expect(instructions?.getCell('A5').value).toBe('周期结束日期');
    expect(instructions?.getCell('B4').numFmt).toBe('yyyy-mm-dd');
    expect(instructions?.getCell('B5').numFmt).toBe('yyyy-mm-dd');
    expect(instructions?.getCell('B4').dataValidation.type).toBe('custom');
    expect(instructions?.getCell('B5').dataValidation.type).toBe('custom');
    expect(instructions?.getCell('B4').protection.locked).toBe(false);
    expect(instructions?.getCell('B5').protection.locked).toBe(false);
    const protectedInstructions = instructions as ExcelJS.Worksheet & {
      sheetProtection?: { sheet?: boolean };
    };
    expect(protectedInstructions.sheetProtection?.sheet).toBe(true);

    expect(details?.getRow(1).values).toEqual([undefined, ...HEADERS]);
    expect(details?.views).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: 'frozen', ySplit: 1 })]),
    );
    expect(details?.autoFilter).toEqual('A1:M1');
    expect(details?.getCell('F2').dataValidation).toMatchObject({
      type: 'list',
      formulae: ['"未开始,进行中,已完成,有风险,已阻塞"'],
    });
    expect(details?.getCell('F2').dataValidation.allowBlank).not.toBe(true);
    expect(details?.getCell('E2').dataValidation).toMatchObject({
      type: 'decimal',
      operator: 'between',
      formulae: [0, 100],
    });
    expect(details?.getCell('I2').dataValidation).toMatchObject({
      type: 'custom',
    });
    expect(details?.getCell('J2').dataValidation).toMatchObject({
      type: 'custom',
    });
  });

  it('round-trips its generated template and normalizes a valid row', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook);

    await expect(parseWorkbook(workbook)).resolves.toEqual({
      meta: {
        templateVersion: 1,
        periodType: 'WEEK',
        periodStart: '2026-07-20',
        periodEnd: '2026-07-26',
      },
      rows: [
        {
          rowNumber: 2,
          employeeName: '张三',
          title: '实现员工周报导入',
          planText: '完成接口设计',
          summaryText: '已完成开发',
          completionRate: 90,
          status: EmployeeWorkStatus.IN_PROGRESS,
          nextPlanText: '联调',
          riskText: null,
          plannedHours: 8,
          actualHours: 7.5,
          projectCode: 'P-001',
          taskCode: 'T-001',
          note: '正常',
          rawValues: {
            员工姓名: '张三',
            工作内容: '实现员工周报导入',
            本期计划: '完成接口设计',
            本期完成情况: '已完成开发',
            完成度: 90,
            工作状态: '进行中',
            下期计划: '联调',
            风险与阻塞: null,
            计划工时: 8,
            实际工时: 7.5,
            项目编号: 'P-001',
            任务编号: 'T-001',
            备注: '正常',
          },
        },
      ],
    });
  });

  it.each([
    ['未开始', EmployeeWorkStatus.NOT_STARTED],
    ['进行中', EmployeeWorkStatus.IN_PROGRESS],
    ['已完成', EmployeeWorkStatus.COMPLETED],
    ['有风险', EmployeeWorkStatus.AT_RISK],
    ['已阻塞', EmployeeWorkStatus.BLOCKED],
  ])('maps status %s to %s', async (label, expected) => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 工作状态: ` ${label} ` });

    const result = await parseWorkbook(workbook);

    expect(result.rows[0].status).toBe(expected);
  });

  it.each([
    { label: 'an integer number', value: 90, numFmt: '0', expected: 90 },
    { label: 'a numeric percentage', value: 0.9, numFmt: '0%', expected: 90 },
    { label: 'a floating-point percentage', value: 0.29, numFmt: '0%', expected: 29 },
    { label: 'percentage text', value: ' 90% ', numFmt: 'General', expected: 90 },
  ])('accepts completion rate as $label', async ({ value, numFmt, expected }) => {
    const workbook = await validTemplateWorkbook();
    const row = addValidRow(workbook, { 完成度: value });
    row.getCell(5).numFmt = numFmt;

    const result = await parseWorkbook(workbook);

    expect(result.rows[0].completionRate).toBe(expected);
  });

  it.each([
    ['a value above 100', 101],
    ['a negative value', -1],
    ['a fractional percentage', 90.5],
    ['a fractional plain number', 0.9],
    ['fractional percentage text', '90.5%'],
  ])('rejects completion rate with %s', async (_label, value) => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 完成度: value });

    await expectInvalid(workbook, /row 2.*完成度/i);
  });

  it.each([
    ['negative planned hours', '计划工时', -0.01],
    ['three-decimal planned hours', '计划工时', 1.001],
    ['negative actual hours', '实际工时', -0.01],
    ['three-decimal actual hours', '实际工时', 1.001],
  ])('rejects %s', async (_label, header, value) => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { [header]: value });

    await expectInvalid(workbook, new RegExp(`row 2.*${header}`, 'i'));
  });

  it('rejects non-XLSX content and XLSX files larger than 20 MiB', async () => {
    await expect(service.parse(Buffer.from('not an xlsx'))).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      statusCode: 422,
    });
    const oversized = Buffer.alloc(MAX_FILE_SIZE + 1);
    oversized.set([0x50, 0x4b, 0x03, 0x04]);
    await expect(service.parse(oversized)).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      statusCode: 422,
    });
  });

  it.each(['说明', '工作明细'])('rejects a workbook missing the %s sheet', async (sheetName) => {
    const workbook = await validTemplateWorkbook();
    workbook.removeWorksheet(workbook.getWorksheet(sheetName)?.id ?? -1);

    await expectInvalid(workbook, /sheet/i);
  });

  it.each([
    ['unsupported template version', 'B3', 2, /version/i],
    ['unsupported period type', 'B2', 'MONTH', /periodType/i],
    ['start that is not Monday', 'B4', new Date(Date.UTC(2026, 6, 21)), /Monday/i],
    ['end that is not matching Sunday', 'B5', new Date(Date.UTC(2026, 6, 27)), /Sunday/i],
    ['a timezone-shifted date', 'B4', new Date('2026-07-20T08:00:00.000Z'), /midnight|timezone/i],
  ])('rejects metadata with %s', async (_label, cell, value, message) => {
    const workbook = await validTemplateWorkbook();
    const instructions = workbook.getWorksheet('说明');
    if (!instructions) throw new Error('说明 sheet missing');
    instructions.getCell(cell).value = value as ExcelJS.CellValue;

    await expectInvalid(workbook, message);
  });

  it.each([
    {
      label: 'a missing header',
      mutate: (sheet: ExcelJS.Worksheet) => {
        sheet.getCell(1, 13).value = null;
      },
    },
    {
      label: 'a duplicate header',
      mutate: (sheet: ExcelJS.Worksheet) => {
        sheet.getCell(1, 2).value = HEADERS[0];
      },
    },
    {
      label: 'an unknown header',
      mutate: (sheet: ExcelJS.Worksheet) => {
        sheet.getCell(1, 2).value = '未知字段';
      },
    },
    {
      label: 'headers out of order',
      mutate: (sheet: ExcelJS.Worksheet) => {
        sheet.getCell(1, 1).value = HEADERS[1];
        sheet.getCell(1, 2).value = HEADERS[0];
      },
    },
  ])('rejects $label', async ({ mutate }) => {
    const workbook = await validTemplateWorkbook();
    mutate(detailSheet(workbook));

    await expectInvalid(workbook, /header/i);
  });

  it('rejects more than 50,000 non-empty data rows', async () => {
    const workbook = await validTemplateWorkbook();
    const sheet = detailSheet(workbook);
    for (let rowNumber = 2; rowNumber <= 50_002; rowNumber += 1) {
      sheet.getCell(rowNumber, 1).value = `员工${rowNumber}`;
    }

    await expectInvalid(workbook, /50,000/);
  });

  it('rejects text longer than 10,000 characters with row and field context', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 工作内容: '工'.repeat(10_001) });

    await expectInvalid(workbook, /row 2.*工作内容/i);
  });

  it.each(['员工姓名', '工作内容', '工作状态'] as const)(
    'rejects a row missing required field %s',
    async (header) => {
      const workbook = await validTemplateWorkbook();
      addValidRow(workbook, { [header]: '   ' });

      await expectInvalid(workbook, new RegExp(`row 2.*${header}`, 'i'));
    },
  );

  it('skips purely empty rows without changing source row numbers', async () => {
    const workbook = await validTemplateWorkbook();
    detailSheet(workbook).getRow(2).values = new Array(13).fill('   ');
    addValidRow(workbook);

    const result = await parseWorkbook(workbook);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].rowNumber).toBe(3);
  });

  it('handles rich text, dates, and cached formula results deterministically', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, {
      员工姓名: { richText: [{ text: ' 张' }, { text: '三 ' }] },
      工作内容: { formula: 'CONCAT("工","作")', result: ' 工作 ' },
      本期计划: new Date(Date.UTC(2026, 6, 20)),
    });

    const result = await parseWorkbook(workbook);

    expect(result.rows[0]).toMatchObject({
      employeeName: '张三',
      title: '工作',
      planText: '2026-07-20',
    });
  });

  it.each([
    { label: 'a formula without a cached result', value: { formula: '1+1' } },
    { label: 'an Excel error', value: { error: '#VALUE!' as const } },
  ])('rejects $label instead of coercing an object', async ({ value }) => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 工作内容: value });

    await expectInvalid(workbook, /row 2.*工作内容/i);
  });
});
