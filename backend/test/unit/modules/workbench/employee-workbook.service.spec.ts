import { Readable } from 'node:stream';
import { EmployeeWorkStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import unzipper from 'unzipper';
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
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0], {
      ignoreNodes: ['dataValidations'],
    });
    return workbook;
  }

  async function readZipEntryText(buffer: Buffer, path: string): Promise<string> {
    const input = Readable.from(buffer);
    const parser = unzipper.Parse({ forceStream: true });
    const archive = input.pipe(parser);
    const chunks: Buffer[] = [];
    try {
      for await (const entry of archive) {
        for await (const chunk of entry) {
          if (entry.path === path) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
          }
        }
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally {
      archive.destroy();
      parser.destroy();
      input.destroy();
    }
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
    const template = await service.template();
    const [workbook, instructionsXml, detailsXml] = await Promise.all([
      loadWorkbook(template),
      readZipEntryText(template, 'xl/worksheets/sheet1.xml'),
      readZipEntryText(template, 'xl/worksheets/sheet2.xml'),
    ]);

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
    expect(instructionsXml).toContain('sqref="B4"');
    expect(instructionsXml).toContain('WEEKDAY(B4,2)=1');
    expect(instructionsXml).toContain('sqref="B5"');
    expect(instructionsXml).toContain('B5=B4+6');
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
    expect(detailsXml).toContain('sqref="F2:F50001"');
    expect(detailsXml).toContain('&quot;未开始,进行中,已完成,有风险,已阻塞&quot;');
    expect(detailsXml).toContain('sqref="E2:E50001"');
    expect(detailsXml).toContain('CELL(&quot;format&quot;,E2)');
    expect(detailsXml).toContain('E2=INT(E2)');
    expect(detailsXml).toContain('sqref="I2:I50001"');
    expect(detailsXml).toContain('I2&lt;=9999.99');
    expect(detailsXml).toContain('sqref="J2:J50001"');
    expect(detailsXml).toContain('J2&lt;=9999.99');
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

    expect('status' in result.rows[0] && result.rows[0].status).toBe(expected);
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

    expect('completionRate' in result.rows[0] && result.rows[0].completionRate).toBe(expected);
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

  it.each([
    ['计划工时', 9999.99],
    ['实际工时', '9999.99'],
  ] as const)('accepts Decimal(6,2) maximum for %s', async (header, value) => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { [header]: value });

    const result = await parseWorkbook(workbook);

    expect(result.rows[0][header === '计划工时' ? 'plannedHours' : 'actualHours']).toBe(9999.99);
  });

  it.each([
    ['计划工时', 10000],
    ['实际工时', '10000'],
    ['计划工时', '1e3'],
  ] as const)('rejects out-of-contract Decimal(6,2) value for %s', async (header, value) => {
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

  it('rejects a workbook with an extra sheet', async () => {
    const workbook = await validTemplateWorkbook();
    workbook.addWorksheet('额外');

    await expectInvalid(workbook, /exactly two sheets/i);
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
    ['a year before 2000', new Date(Date.UTC(1999, 0, 4))],
    ['a year after 2100', new Date(Date.UTC(2101, 0, 3))],
    ['a negative Excel serial', -1],
  ])('rejects periodStart with %s', async (_label, value) => {
    const workbook = await validTemplateWorkbook();
    const instructions = workbook.getWorksheet('说明');
    if (!instructions) throw new Error('说明 sheet missing');
    instructions.getCell('B4').value = value;

    await expectInvalid(workbook, /2000.*2100|date range/i);
  });

  it('parses valid dates from a 1904-date-system workbook', async () => {
    const workbook = await validTemplateWorkbook();
    workbook.properties.date1904 = true;

    await expect(parseWorkbook(workbook)).resolves.toMatchObject({
      meta: {
        periodStart: '2026-07-20',
        periodEnd: '2026-07-26',
      },
    });
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

  it('does not instantiate missing rows when a single cell uses Excel maximum row', async () => {
    const workbook = await validTemplateWorkbook();
    detailSheet(workbook).getCell(1_048_576, 1).value = '稀疏员工';
    const buffer = await saveWorkbook(workbook);
    const worksheetPrototype = Object.getPrototypeOf(detailSheet(workbook)) as ExcelJS.Worksheet;
    const originalGetRow = worksheetPrototype.getRow;
    let getRowCalls = 0;
    const getRowSpy = jest.spyOn(worksheetPrototype, 'getRow').mockImplementation(function (
      this: ExcelJS.Worksheet,
      rowNumber: number,
    ) {
      getRowCalls += 1;
      if (getRowCalls > 100) throw new Error('dense row scan detected');
      return originalGetRow.call(this, rowNumber);
    });

    try {
      await expect(service.parse(buffer)).rejects.toMatchObject({
        code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
        statusCode: 422,
      });
      expect(getRowCalls).toBeLessThan(100);
    } finally {
      getRowSpy.mockRestore();
    }
  });

  it('does not instantiate missing columns when a row uses Excel maximum column', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook);
    detailSheet(workbook).getCell(2, 16_384).value = '越界数据';
    const buffer = await saveWorkbook(workbook);
    const rowPrototype = Object.getPrototypeOf(detailSheet(workbook).getRow(2)) as ExcelJS.Row;
    const originalGetCell = rowPrototype.getCell;
    let getCellCalls = 0;
    const getCellSpy = jest.spyOn(rowPrototype, 'getCell').mockImplementation(function (
      this: ExcelJS.Row,
      ...args: Parameters<ExcelJS.Row['getCell']>
    ) {
      getCellCalls += 1;
      if (getCellCalls > 100) throw new Error('dense column scan detected');
      return originalGetCell.apply(this, args);
    });

    try {
      await expect(service.parse(buffer)).rejects.toMatchObject({
        code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
        statusCode: 422,
      });
      expect(getCellCalls).toBeLessThan(100);
    } finally {
      getCellSpy.mockRestore();
    }
  });

  it('does not densely scan header columns when XFD1 contains an unknown header', async () => {
    const workbook = await validTemplateWorkbook();
    detailSheet(workbook).getCell('XFD1').value = '越界表头';
    const buffer = await saveWorkbook(workbook);
    const rowPrototype = Object.getPrototypeOf(detailSheet(workbook).getRow(1)) as ExcelJS.Row;
    const originalGetCell = rowPrototype.getCell;
    let getCellCalls = 0;
    const getCellSpy = jest.spyOn(rowPrototype, 'getCell').mockImplementation(function (
      this: ExcelJS.Row,
      ...args: Parameters<ExcelJS.Row['getCell']>
    ) {
      getCellCalls += 1;
      if (getCellCalls > 100) throw new Error('dense header column scan detected');
      return originalGetCell.apply(this, args);
    });

    try {
      await expect(service.parse(buffer)).rejects.toMatchObject({
        code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
        statusCode: 422,
      });
      expect(getCellCalls).toBeLessThan(100);
    } finally {
      getCellSpy.mockRestore();
    }
  });

  it('rejects text longer than 10,000 characters with row and field context', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 工作内容: '工'.repeat(10_001) });

    await expectInvalid(workbook, /row 2.*工作内容/i);
  });

  it.each([
    ['10,001 whitespace characters', ' '.repeat(10_001)],
    [
      '10,001 rich-text characters',
      { richText: [{ text: ' '.repeat(5_001) }, { text: ' '.repeat(5_000) }] },
    ],
  ])('checks raw text length before trimming for %s', async (_label, value) => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 工作内容: value });

    await expectInvalid(workbook, /row 2.*工作内容.*10,000/i);
  });

  it.each(['B6', 'B18'])('rejects oversized instruction text in %s', async (address) => {
    const workbook = await validTemplateWorkbook();
    const instructions = workbook.getWorksheet('说明');
    if (!instructions) throw new Error('说明 sheet missing');
    instructions.getCell(address).value = ' '.repeat(10_001);

    await expectInvalid(workbook, /10,000/i);
  });

  it('rejects non-empty instruction cells outside A1:B18', async () => {
    const workbook = await validTemplateWorkbook();
    const instructions = workbook.getWorksheet('说明');
    if (!instructions) throw new Error('说明 sheet missing');
    instructions.getCell('C1').value = '隐藏数据';

    await expectInvalid(workbook, /说明.*outside|C1/i);
  });

  it.each([
    '员工姓名',
    '完成度',
    '工作状态',
    '计划工时',
    '实际工时',
    '项目编号',
    '任务编号',
  ] as const)('rejects cached formulas in critical field %s', async (field) => {
    const workbook = await validTemplateWorkbook();
    const cachedResults: Record<typeof field, string | number> = {
      员工姓名: '张三',
      完成度: 90,
      工作状态: '进行中',
      计划工时: 8,
      实际工时: 7,
      项目编号: 'P-001',
      任务编号: 'T-001',
    };
    addValidRow(workbook, {
      [field]: { formula: '"cached"', result: cachedResults[field] },
    });

    await expectInvalid(workbook, new RegExp(`row 2.*${field}.*formula`, 'i'));
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

  it('reports an invalid Date cell as an unsupported value without throwing RangeError', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 本期计划: new Date(Number.NaN) });

    const result = await service.inspect(await saveWorkbook(workbook));

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          field: '本期计划',
          code: 'UNSUPPORTED_CELL_VALUE',
        }),
      ]),
    );
  });

  it('rejects an oversized allowed formula expression independently of its cached result', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, {
      工作内容: { formula: 'A'.repeat(10_001), result: '短' },
    });

    const result = await service.inspect(await saveWorkbook(workbook));
    const issue = result.issues.find(({ field }) => field === '工作内容');

    expect(issue).toMatchObject({ code: 'TEXT_TOO_LONG' });
    expect(issue?.rawValue).toEqual(expect.stringMatching(/^'=/));
    expect(String(issue?.rawValue).length).toBeLessThanOrEqual(256);
    expect(result.sourceRows[0].rawValues['工作内容']).toEqual(expect.stringMatching(/^'=/));
    expect(String(result.sourceRows[0].rawValues['工作内容']).length).toBeLessThanOrEqual(10_000);
  });

  it.each([
    { label: 'a formula without a cached result', value: { formula: '1+1' } },
    { label: 'an Excel error', value: { error: '#VALUE!' as const } },
  ])('rejects $label instead of coercing an object', async ({ value }) => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, { 工作内容: value });

    await expectInvalid(workbook, /row 2.*工作内容/i);
  });

  it('inspect collects all field issues while retaining valid and source rows', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook);
    addValidRow(workbook, {
      员工姓名: ' ',
      工作内容: ' ',
      完成度: 90.5,
      工作状态: ' ',
      计划工时: 10000,
    });
    addValidRow(workbook, {
      工作状态: '未知',
      实际工时: '1e3',
    });

    const result = await service.inspect(await saveWorkbook(workbook));

    expect(result.rows.map(({ rowNumber }) => rowNumber)).toEqual([2]);
    expect(result.sourceRows.map(({ rowNumber }) => rowNumber)).toEqual([2, 3, 4]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowNumber: 3, field: '员工姓名', code: 'REQUIRED_FIELD' }),
        expect.objectContaining({ rowNumber: 3, field: '工作内容', code: 'REQUIRED_FIELD' }),
        expect.objectContaining({ rowNumber: 3, field: '完成度', code: 'INVALID_VALUE' }),
        expect.objectContaining({ rowNumber: 3, field: '工作状态', code: 'REQUIRED_FIELD' }),
        expect.objectContaining({ rowNumber: 3, field: '计划工时', code: 'INVALID_VALUE' }),
        expect.objectContaining({ rowNumber: 4, field: '工作状态', code: 'INVALID_VALUE' }),
        expect.objectContaining({ rowNumber: 4, field: '实际工时', code: 'INVALID_VALUE' }),
      ]),
    );
  });

  it('strict parse reports bounded aggregate issue details', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, {
      员工姓名: ' ',
      工作内容: ' ',
      完成度: 90.5,
      工作状态: '未知',
    });
    addValidRow(workbook, {
      计划工时: 10000,
      实际工时: '1e3',
    });

    await expect(service.parse(await saveWorkbook(workbook))).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      statusCode: 422,
      details: {
        total: 6,
        truncated: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ rowNumber: 2, field: '员工姓名' }),
          expect.objectContaining({ rowNumber: 3, field: '计划工时' }),
        ]),
      },
    });
  });

  it('inspect escapes formulas and truncates issue raw values', async () => {
    const workbook = await validTemplateWorkbook();
    addValidRow(workbook, {
      员工姓名: {
        formula: `CONCAT("${'A'.repeat(1_000)}")`,
        result: '张三',
      },
      工作内容: 'X'.repeat(10_001),
    });

    const result = await service.inspect(await saveWorkbook(workbook));
    const formulaIssue = result.issues.find(({ field }) => field === '员工姓名');
    const lengthIssue = result.issues.find(({ field }) => field === '工作内容');

    expect(formulaIssue).toMatchObject({ code: 'FORMULA_NOT_ALLOWED' });
    expect(formulaIssue?.rawValue).toEqual(expect.stringMatching(/^'=/));
    expect(String(formulaIssue?.rawValue).length).toBeLessThanOrEqual(256);
    expect(lengthIssue).toMatchObject({ code: 'TEXT_TOO_LONG' });
    expect(String(lengthIssue?.rawValue).length).toBeLessThanOrEqual(256);
    expect(result.sourceRows[0].rawValues['员工姓名']).toEqual(expect.stringMatching(/^'=/));
    expect(String(result.sourceRows[0].rawValues['工作内容']).length).toBe(10_000);
  });

  it('inspect still rejects workbook-level structural errors immediately', async () => {
    const workbook = await validTemplateWorkbook();
    workbook.addWorksheet('额外');

    await expect(service.inspect(await saveWorkbook(workbook))).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      statusCode: 422,
    });
  });
});
