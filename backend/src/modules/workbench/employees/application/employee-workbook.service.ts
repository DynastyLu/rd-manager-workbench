import { HttpStatus, Injectable } from '@nestjs/common';
import { EmployeeWorkStatus, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  EmployeeWorkbookInspectionIssue,
  EmployeeWorkbookInspectionResult,
  EmployeeWorkbookIssueCode,
  EmployeeWorkbookMeta,
  EmployeeWorkbookParseResult,
  EmployeeWorkbookSourceRow,
  EmployeeWorkbookValidationIssue,
  NormalizedEmployeeWorkRow,
} from '../domain/employee-work.types';
import { preflightEmployeeWorkbookZip } from './employee-workbook-zip-preflight';

const TEMPLATE_VERSION = 1 as const;
const PERIOD_TYPE = 'WEEK' as const;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_DATA_ROWS = 50_000;
const MAX_CELL_TEXT_LENGTH = 10_000;
const TEMPLATE_VALIDATION_LAST_ROW = 50_001;
const MAX_ISSUES_IN_ERROR_DETAILS = 1_000;
const MAX_ISSUE_RAW_VALUE_LENGTH = 256;

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

type EmployeeWorkHeader = (typeof HEADERS)[number];
type NormalizedCellValue = string | number | null;

const STATUS_MAP: Readonly<Record<string, EmployeeWorkStatus>> = {
  未开始: EmployeeWorkStatus.NOT_STARTED,
  进行中: EmployeeWorkStatus.IN_PROGRESS,
  已完成: EmployeeWorkStatus.COMPLETED,
  有风险: EmployeeWorkStatus.AT_RISK,
  已阻塞: EmployeeWorkStatus.BLOCKED,
};

const CRITICAL_FORMULA_COLUMNS = new Set<number>([1, 5, 6, 9, 10, 11, 12]);
const VOLATILE_FORMULA = /\b(?:CELL|INFO|NOW|RAND|RANDBETWEEN|OFFSET|INDIRECT|TODAY)\s*\(/i;

interface DataValidationStore {
  add(address: string, validation: ExcelJS.DataValidation): void;
}

interface WorksheetWithDataValidations extends ExcelJS.Worksheet {
  dataValidations: DataValidationStore;
}

interface ParsedSourceRow {
  rowNumber: number;
  rawValues: Record<EmployeeWorkHeader, NormalizedCellValue>;
  cells: ExcelJS.Cell[];
}

interface InspectedEmployeeRow {
  normalizedRow?: NormalizedEmployeeWorkRow;
  sourceRow: EmployeeWorkbookSourceRow;
  issues: EmployeeWorkbookInspectionIssue[];
  isBlank: boolean;
}

@Injectable()
export class EmployeeWorkbookService {
  async template(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RD Manager Workbench';
    workbook.created = new Date(0);
    workbook.modified = new Date(0);

    const instructions = workbook.addWorksheet('说明', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    this.configureInstructionsSheet(instructions);
    await instructions.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
      objects: true,
      scenarios: true,
      spinCount: 1_000,
    });

    const details = workbook.addWorksheet('工作明细', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    this.configureDetailsSheet(details);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async parse(buffer: Buffer): Promise<EmployeeWorkbookParseResult> {
    const inspected = await this.inspect(buffer);
    if (inspected.issues.length > 0) {
      const issues = inspected.issues.slice(0, MAX_ISSUES_IN_ERROR_DETAILS);
      const firstIssue = inspected.issues[0];
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_TEMPLATE_INVALID,
        message: `row ${firstIssue.rowNumber} ${firstIssue.field}: ${firstIssue.reason} (${inspected.issues.length} total issue(s))`,
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        details: {
          issues,
          total: inspected.issues.length,
          truncated: issues.length < inspected.issues.length,
        },
      });
    }
    return { meta: inspected.meta, rows: inspected.rows };
  }

  async inspect(buffer: Buffer): Promise<EmployeeWorkbookInspectionResult> {
    this.assertFile(buffer);
    await preflightEmployeeWorkbookZip(buffer);

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0], {
        ignoreNodes: ['picture', 'dataValidations'],
      });
    } catch (cause) {
      throw this.invalid('File is not a parseable XLSX workbook', undefined, cause);
    }

    if (
      workbook.worksheets.length !== 2 ||
      workbook.worksheets[0]?.name !== '说明' ||
      workbook.worksheets[1]?.name !== '工作明细'
    ) {
      throw this.invalid('Workbook must contain exactly two sheets in order: 说明, 工作明细');
    }
    const instructions = workbook.worksheets[0];
    const details = workbook.worksheets[1];

    this.assertInstructionsSheet(instructions);
    const meta = this.parseMeta(instructions, workbook.properties.date1904 === true);
    this.assertHeaders(details);
    const { rows, sourceRows, issues } = this.inspectDataRows(details);

    return { meta, rows, sourceRows, issues };
  }

  private configureInstructionsSheet(sheet: ExcelJS.Worksheet): void {
    const rows: Array<[string, string | number | null]> = [
      ['数据类型', '周计划与总结'],
      ['周期类型', PERIOD_TYPE],
      ['模板版本', TEMPLATE_VERSION],
      ['周期开始日期', null],
      ['周期结束日期', null],
      ['允许状态值', '未开始 / 进行中 / 已完成 / 有风险 / 已阻塞'],
      ['填写说明', '周期开始必须为周一，周期结束必须为对应周日。'],
      ['员工姓名', '必填；填写员工的标准姓名。'],
      ['工作内容', '必填；简洁描述本条工作。'],
      ['本期计划', '选填；填写本周期计划。'],
      ['本期完成情况', '选填；填写本周期实际完成情况。'],
      ['完成度', '选填；填写 0 到 100 的整数，也可填写百分比。'],
      ['工作状态', '必填；只能使用允许状态值。'],
      ['下期计划', '选填；填写下一周期计划。'],
      ['风险与阻塞', '选填；说明风险、阻塞和所需支持。'],
      ['计划工时 / 实际工时', '选填；非负数，最多两位小数。'],
      ['项目编号 / 任务编号', '选填；填写系统中的对应编号。'],
      ['备注', '选填；补充其他说明。'],
    ];
    sheet.addRows(rows);
    sheet.columns = [{ width: 24 }, { width: 62 }];
    sheet.getRow(1).height = 24;

    for (let rowNumber = 1; rowNumber <= rows.length; rowNumber += 1) {
      const label = sheet.getCell(rowNumber, 1);
      const value = sheet.getCell(rowNumber, 2);
      label.font = { bold: true, color: { argb: 'FF16324F' } };
      label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEAF7' } };
      label.alignment = { vertical: 'middle', wrapText: true };
      label.protection = { locked: true };
      value.alignment = { vertical: 'middle', wrapText: true };
      value.protection = { locked: true };
      label.border = this.thinBorder();
      value.border = this.thinBorder();
    }

    for (const address of ['B4', 'B5']) {
      const dateCell = sheet.getCell(address);
      dateCell.numFmt = 'yyyy-mm-dd';
      dateCell.protection = { locked: false };
      dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    }
    sheet.getCell('B4').dataValidation = {
      type: 'custom',
      formulae: ['AND(ISNUMBER(B4),WEEKDAY(B4,2)=1)'],
      allowBlank: false,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: '日期无效',
      error: '周期开始日期必须是周一。',
      showInputMessage: true,
      promptTitle: '周期开始日期',
      prompt: '请选择或输入周一日期。',
    };
    sheet.getCell('B5').dataValidation = {
      type: 'custom',
      formulae: ['AND(ISNUMBER(B5),WEEKDAY(B5,2)=7,B5=B4+6)'],
      allowBlank: false,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: '日期无效',
      error: '周期结束日期必须是开始日期对应的周日。',
      showInputMessage: true,
      promptTitle: '周期结束日期',
      prompt: '请选择或输入与开始日期对应的周日。',
    };
  }

  private configureDetailsSheet(sheet: ExcelJS.Worksheet): void {
    sheet.addRow([...HEADERS]);
    sheet.columns = [
      { width: 16 },
      { width: 32 },
      { width: 32 },
      { width: 32 },
      { width: 12 },
      { width: 14 },
      { width: 32 },
      { width: 32 },
      { width: 12 },
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 28 },
    ];
    sheet.autoFilter = 'A1:M1';
    sheet.getRow(1).height = 28;
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    const validations = (sheet as WorksheetWithDataValidations).dataValidations;
    validations.add(`F2:F${TEMPLATE_VALIDATION_LAST_ROW}`, {
      type: 'list',
      formulae: ['"未开始,进行中,已完成,有风险,已阻塞"'],
      allowBlank: false,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: '状态无效',
      error: '请选择未开始、进行中、已完成、有风险或已阻塞。',
    });
    validations.add(`E2:E${TEMPLATE_VALIDATION_LAST_ROW}`, {
      type: 'custom',
      formulae: [
        'OR(AND(ISNUMBER(E2),E2>=0,E2<=100,E2=INT(E2)),AND(ISNUMBER(E2),E2>=0,E2<=1,LEFT(CELL("format",E2),1)="P",E2*100=INT(E2*100)))',
      ],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: '完成度无效',
      error: '完成度必须是 0 到 100。',
    });
    validations.add(`I2:I${TEMPLATE_VALIDATION_LAST_ROW}`, {
      type: 'custom',
      formulae: ['OR(I2="",AND(ISNUMBER(I2),I2>=0,I2<=9999.99,ROUND(I2,2)=I2))'],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: '计划工时无效',
      error: '计划工时必须非负且最多两位小数。',
    });
    validations.add(`J2:J${TEMPLATE_VALIDATION_LAST_ROW}`, {
      type: 'custom',
      formulae: ['OR(J2="",AND(ISNUMBER(J2),J2>=0,J2<=9999.99,ROUND(J2,2)=J2))'],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: '实际工时无效',
      error: '实际工时必须非负且最多两位小数。',
    });
  }

  private parseMeta(sheet: ExcelJS.Worksheet, date1904: boolean): EmployeeWorkbookMeta {
    const dataType = this.normalizeCellValue(sheet.getCell('B1'), { field: 'dataType' });
    if (dataType !== '周计划与总结') {
      throw this.invalid('dataType must be 周计划与总结', { field: 'dataType' });
    }

    const periodType = this.normalizeCellValue(sheet.getCell('B2'), { field: 'periodType' });
    if (periodType !== PERIOD_TYPE) {
      throw this.invalid('periodType must be WEEK', { field: 'periodType' });
    }

    const version = this.normalizeCellValue(sheet.getCell('B3'), { field: 'templateVersion' });
    if (version !== TEMPLATE_VERSION && version !== String(TEMPLATE_VERSION)) {
      throw this.invalid('template version must be 1', { field: 'templateVersion' });
    }

    const periodStart = this.parseDateCell(sheet.getCell('B4'), date1904, 'periodStart');
    const periodEnd = this.parseDateCell(sheet.getCell('B5'), date1904, 'periodEnd');
    const startTimestamp = Date.parse(`${periodStart}T00:00:00.000Z`);
    const endTimestamp = Date.parse(`${periodEnd}T00:00:00.000Z`);
    if (new Date(startTimestamp).getUTCDay() !== 1) {
      throw this.invalid('periodStart must be a Monday', { field: 'periodStart' });
    }
    if (
      new Date(endTimestamp).getUTCDay() !== 0 ||
      endTimestamp - startTimestamp !== 6 * 86_400_000
    ) {
      throw this.invalid('periodEnd must be the corresponding Sunday', { field: 'periodEnd' });
    }

    return {
      templateVersion: TEMPLATE_VERSION,
      periodType: PERIOD_TYPE,
      periodStart,
      periodEnd,
    };
  }

  private assertInstructionsSheet(sheet: ExcelJS.Worksheet): void {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const field = cell.address;
        this.assertRawCellTextLength(cell.value, { rowNumber, field });
        if (rowNumber > 18 || columnNumber > 2) {
          throw this.invalid(`说明 contains data outside A1:B18 at ${cell.address}`, {
            rowNumber,
            field,
          });
        }
        if (this.isFormulaValue(cell.value)) {
          throw this.invalid('formulas are not allowed in the 说明 sheet', {
            rowNumber,
            field,
          });
        }
      });
    });
  }

  private parseDateCell(cell: ExcelJS.Cell, date1904: boolean, field: string): string {
    const value = this.resolveCellValue(cell.value, { field });
    if (value instanceof Date) {
      if (
        value.getUTCHours() !== 0 ||
        value.getUTCMinutes() !== 0 ||
        value.getUTCSeconds() !== 0 ||
        value.getUTCMilliseconds() !== 0
      ) {
        throw this.invalid(`${field} must be an Excel date at UTC midnight (no timezone shift)`, {
          field,
        });
      }
      return this.assertPeriodDateRange(this.formatUtcDate(value), field);
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
        throw this.invalid(`${field} must be a whole Excel date without a time component`, {
          field,
        });
      }
      const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
      return this.assertPeriodDateRange(
        this.formatUtcDate(new Date(epoch + value * 86_400_000)),
        field,
      );
    }
    if (typeof value === 'string') {
      const normalized = value.trim();
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
      if (!match) {
        throw this.invalid(`${field} must use YYYY-MM-DD`, { field });
      }
      const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (this.formatUtcDate(parsed) !== normalized) {
        throw this.invalid(`${field} is not a valid calendar date`, { field });
      }
      return this.assertPeriodDateRange(normalized, field);
    }
    throw this.invalid(`${field} is required and must be a date`, { field });
  }

  private assertPeriodDateRange(value: string, field: string): string {
    const year = Number(value.slice(0, 4));
    if (year < 2000 || year > 2100) {
      throw this.invalid(`${field} year must be between 2000 and 2100`, { field });
    }
    return value;
  }

  private assertHeaders(sheet: ExcelJS.Worksheet): void {
    const headerRow = sheet.getRow(1);
    const actual = HEADERS.map((_, index) =>
      this.normalizeCellValue(headerRow.getCell(index + 1), {
        rowNumber: 1,
        field: `header ${index + 1}`,
      }),
    );
    headerRow.eachCell({ includeEmpty: false }, (cell, column) => {
      if (column <= HEADERS.length) return;
      const extra = this.normalizeCellValue(cell, {
        rowNumber: 1,
        field: `header ${column}`,
      });
      if (extra !== null) actual.push(extra);
    });
    if (
      actual.length !== HEADERS.length ||
      actual.some((value, index) => value !== HEADERS[index])
    ) {
      throw this.invalid('header row must contain the exact 13 columns in the required order', {
        rowNumber: 1,
        field: 'headers',
      });
    }
  }

  private inspectDataRows(sheet: ExcelJS.Worksheet): {
    rows: NormalizedEmployeeWorkRow[];
    sourceRows: EmployeeWorkbookSourceRow[];
    issues: EmployeeWorkbookInspectionIssue[];
  } {
    let nonEmptyRows = 0;
    const rows: NormalizedEmployeeWorkRow[] = [];
    const sourceRows: EmployeeWorkbookSourceRow[] = [];
    const issues: EmployeeWorkbookInspectionIssue[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const inspected = this.inspectRow(row);
      if (inspected.isBlank) return;
      nonEmptyRows += 1;
      if (nonEmptyRows > MAX_DATA_ROWS) {
        throw this.invalid('Workbook contains more than 50,000 non-empty data rows', {
          rowNumber,
        });
      }
      sourceRows.push(inspected.sourceRow);
      issues.push(...inspected.issues);
      if (inspected.normalizedRow) rows.push(inspected.normalizedRow);
    });
    return { rows, sourceRows, issues };
  }

  private inspectRow(row: ExcelJS.Row): InspectedEmployeeRow {
    const rawValues = {} as Record<EmployeeWorkHeader, NormalizedCellValue>;
    const sourceRawValues = {} as Record<EmployeeWorkHeader, NormalizedCellValue>;
    const cells: ExcelJS.Cell[] = [];
    const issues: EmployeeWorkbookInspectionIssue[] = [];
    const invalidFields = new Set<EmployeeWorkHeader>();

    for (let index = 0; index < HEADERS.length; index += 1) {
      const header = HEADERS[index];
      const cell = row.getCell(index + 1);
      cells.push(cell);
      sourceRawValues[header] = this.safeRawValue(cell.value, MAX_CELL_TEXT_LENGTH);
      try {
        this.assertFormulaPolicy(cell.value, index + 1, row.number, header);
        rawValues[header] = this.normalizeCellValue(cell, {
          rowNumber: row.number,
          field: header,
        });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        rawValues[header] = null;
        invalidFields.add(header);
        issues.push(
          this.inspectionIssueFromError(
            error,
            row.number,
            header,
            cell.value,
            this.cellIssueCode(error),
          ),
        );
      }
    }

    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (column <= HEADERS.length) return;
      const field = `column ${column}`;
      const safeValue = this.safeRawValue(cell.value, MAX_CELL_TEXT_LENGTH);
      try {
        this.assertRawCellTextLength(cell.value, { rowNumber: row.number, field });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        issues.push({
          ...this.inspectionIssueFromError(error, row.number, field, cell.value, 'TEXT_TOO_LONG'),
        });
      }
      if (safeValue !== null) {
        issues.push({
          code: 'DATA_OUTSIDE_SCHEMA',
          rowNumber: row.number,
          field,
          rawValue: this.safeRawValue(cell.value, MAX_ISSUE_RAW_VALUE_LENGTH),
          reason: 'data exists outside the 13 defined columns',
        });
      }
    });

    const source: ParsedSourceRow = { rowNumber: row.number, rawValues, cells };
    const sourceRow: EmployeeWorkbookSourceRow = {
      rowNumber: row.number,
      rawValues: sourceRawValues,
    };

    const hasSourceValue = Object.values(sourceRawValues).some((value) => value !== null);
    if (!hasSourceValue && issues.length === 0) {
      return { sourceRow, issues, isBlank: true };
    }

    const capture = <T>(
      field: EmployeeWorkHeader,
      code: EmployeeWorkbookIssueCode,
      work: () => T,
    ): T | undefined => {
      if (invalidFields.has(field)) return undefined;
      try {
        return work();
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        issues.push(
          this.inspectionIssueFromError(
            error,
            row.number,
            field,
            cells[HEADERS.indexOf(field)].value,
            this.isRequiredError(error) ? 'REQUIRED_FIELD' : code,
          ),
        );
        invalidFields.add(field);
        return undefined;
      }
    };

    const employeeName = capture('员工姓名', 'REQUIRED_FIELD', () =>
      this.requiredText(source, '员工姓名'),
    );
    const title = capture('工作内容', 'REQUIRED_FIELD', () =>
      this.requiredText(source, '工作内容'),
    );
    const completionRate = capture('完成度', 'INVALID_VALUE', () =>
      this.parseCompletionRate(source),
    );
    const status = capture('工作状态', 'INVALID_VALUE', () => this.parseStatus(source));
    const plannedHours = capture('计划工时', 'INVALID_VALUE', () =>
      this.parseHours(source, '计划工时'),
    );
    const actualHours = capture('实际工时', 'INVALID_VALUE', () =>
      this.parseHours(source, '实际工时'),
    );

    if (
      issues.length > 0 ||
      employeeName === undefined ||
      title === undefined ||
      status === undefined
    ) {
      return { sourceRow, issues, isBlank: false };
    }

    return {
      sourceRow,
      issues,
      isBlank: false,
      normalizedRow: {
        rowNumber: row.number,
        employeeName,
        title,
        planText: this.optionalText(source, '本期计划'),
        summaryText: this.optionalText(source, '本期完成情况'),
        completionRate: completionRate ?? null,
        status,
        nextPlanText: this.optionalText(source, '下期计划'),
        riskText: this.optionalText(source, '风险与阻塞'),
        plannedHours: plannedHours ?? null,
        actualHours: actualHours ?? null,
        projectCode: this.optionalText(source, '项目编号'),
        taskCode: this.optionalText(source, '任务编号'),
        note: this.optionalText(source, '备注'),
        rawValues,
      },
    };
  }

  private assertFormulaPolicy(
    value: ExcelJS.CellValue,
    columnNumber: number,
    rowNumber: number,
    field: string,
  ): void {
    if (!this.isFormulaValue(value)) return;
    const formula =
      ('formula' in value ? value.formula : (value.formula ?? value.sharedFormula)) ?? '';
    if (
      CRITICAL_FORMULA_COLUMNS.has(columnNumber) ||
      'sharedFormula' in value ||
      formula.includes('[') ||
      VOLATILE_FORMULA.test(formula)
    ) {
      throw this.invalid('formula is not allowed in this field', {
        rowNumber,
        field,
      });
    }
  }

  private requiredText(source: ParsedSourceRow, field: EmployeeWorkHeader): string {
    const value = this.optionalText(source, field);
    if (value === null) {
      throw this.invalid('required field is blank', {
        rowNumber: source.rowNumber,
        field,
      });
    }
    return value;
  }

  private optionalText(source: ParsedSourceRow, field: EmployeeWorkHeader): string | null {
    const value = source.rawValues[field];
    if (value === null) return null;
    return typeof value === 'number' ? String(value) : value;
  }

  private parseCompletionRate(source: ParsedSourceRow): number | null {
    const field = '完成度' as const;
    const value = source.rawValues[field];
    if (value === null) return null;

    let parsed: number;
    if (typeof value === 'number') {
      parsed = (source.cells[4].numFmt ?? '').includes('%') ? value * 100 : value;
    } else {
      const match = /^(\d+(?:\.\d+)?)%$/.exec(value);
      if (!match) {
        throw this.invalid('must be an integer from 0 to 100 or percentage text', {
          rowNumber: source.rowNumber,
          field,
        });
      }
      parsed = Number(match[1]);
    }

    const rounded = Math.round(parsed);
    if (
      !Number.isFinite(parsed) ||
      Math.abs(parsed - rounded) > 1e-8 ||
      rounded < 0 ||
      rounded > 100
    ) {
      throw this.invalid('must resolve to an integer from 0 to 100', {
        rowNumber: source.rowNumber,
        field,
      });
    }
    return rounded;
  }

  private parseStatus(source: ParsedSourceRow): EmployeeWorkStatus {
    const field = '工作状态' as const;
    const value = source.rawValues[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw this.invalid('required field is blank', {
        rowNumber: source.rowNumber,
        field,
      });
    }
    const status = STATUS_MAP[value];
    if (!status) {
      throw this.invalid('must be one of 未开始, 进行中, 已完成, 有风险, 已阻塞', {
        rowNumber: source.rowNumber,
        field,
      });
    }
    return status;
  }

  private parseHours(source: ParsedSourceRow, field: '计划工时' | '实际工时'): number | null {
    const value = source.rawValues[field];
    if (value === null) return null;

    const decimalText = typeof value === 'number' ? value.toString() : value;
    if (!/^\d+(?:\.\d{1,2})?$/.test(decimalText)) {
      throw this.invalid('must be non-negative with at most two decimal places', {
        rowNumber: source.rowNumber,
        field,
      });
    }
    const decimal = new Prisma.Decimal(decimalText);
    if (decimal.decimalPlaces() > 2 || decimal.greaterThan(new Prisma.Decimal('9999.99'))) {
      throw this.invalid('must be between 0 and 9999.99 with at most two decimal places', {
        rowNumber: source.rowNumber,
        field,
      });
    }
    return decimal.toNumber();
  }

  private normalizeCellValue(
    cell: ExcelJS.Cell,
    issue: Omit<EmployeeWorkbookValidationIssue, 'reason'>,
  ): NormalizedCellValue {
    this.assertRawCellTextLength(cell.value, issue);
    const value = this.resolveCellValue(cell.value, issue);
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw this.invalid('must contain a finite number', issue);
      }
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized.length > MAX_CELL_TEXT_LENGTH) {
        throw this.invalid('text exceeds 10,000 characters', issue);
      }
      return normalized.length === 0 ? null : normalized;
    }
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) {
        throw this.invalid('contains an invalid date', issue);
      }
      if (
        value.getUTCHours() !== 0 ||
        value.getUTCMinutes() !== 0 ||
        value.getUTCSeconds() !== 0 ||
        value.getUTCMilliseconds() !== 0
      ) {
        throw this.invalid('date must not contain a time or timezone shift', issue);
      }
      return this.formatUtcDate(value);
    }
    throw this.invalid('contains an unsupported Excel value', issue);
  }

  private assertRawCellTextLength(
    value: ExcelJS.CellValue,
    issue: Omit<EmployeeWorkbookValidationIssue, 'reason'>,
  ): void {
    let textLength = 0;
    if (typeof value === 'string') {
      textLength = value.length;
    } else if (value && typeof value === 'object') {
      if ('richText' in value) {
        textLength = value.richText.reduce((total, { text }) => total + text.length, 0);
      } else if ('hyperlink' in value) {
        textLength = value.text.length;
      } else if (this.isFormulaValue(value)) {
        const formula = ('formula' in value ? value.formula : value.sharedFormula) ?? '';
        if (formula.length > MAX_CELL_TEXT_LENGTH) {
          throw this.invalid('raw formula text exceeds 10,000 characters', issue);
        }
        if (typeof value.result === 'string') textLength = value.result.length;
      }
    }
    if (textLength > MAX_CELL_TEXT_LENGTH) {
      throw this.invalid('raw text exceeds 10,000 characters', issue);
    }
  }

  private safeRawValue(value: ExcelJS.CellValue, maxLength: number): NormalizedCellValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'string') return this.safeTextValue(value, maxLength);
    if (typeof value === 'boolean') return String(value);
    if (value instanceof Date) {
      return Number.isFinite(value.getTime())
        ? this.safeTextValue(value.toISOString(), maxLength)
        : this.safeTextValue('[invalid date]', maxLength);
    }
    if ('richText' in value) {
      return this.safeTextValue(value.richText.map(({ text }) => text).join(''), maxLength);
    }
    if ('hyperlink' in value) {
      return this.safeTextValue(value.text, maxLength);
    }
    if (this.isFormulaValue(value)) {
      const formula =
        ('formula' in value ? value.formula : (value.formula ?? value.sharedFormula)) ?? '';
      return this.safeTextValue(`=${formula}`, maxLength);
    }
    if ('error' in value) {
      return this.safeTextValue(`[Excel error ${value.error}]`, maxLength);
    }
    return this.safeTextValue('[unsupported Excel value]', maxLength);
  }

  private safeTextValue(value: string, maxLength: number): string | null {
    const normalized = value.slice(0, maxLength).trim();
    if (normalized.length === 0) return null;
    return /^[=+\-@]/.test(normalized)
      ? `'${normalized.slice(0, Math.max(maxLength - 1, 0))}`
      : normalized;
  }

  private inspectionIssueFromError(
    error: AppError,
    rowNumber: number,
    field: string,
    rawValue: ExcelJS.CellValue,
    code: EmployeeWorkbookIssueCode,
  ): EmployeeWorkbookInspectionIssue {
    return {
      code,
      rowNumber,
      field,
      rawValue: this.safeRawValue(rawValue, MAX_ISSUE_RAW_VALUE_LENGTH),
      reason: this.appErrorReason(error),
    };
  }

  private cellIssueCode(error: AppError): EmployeeWorkbookIssueCode {
    const reason = this.appErrorReason(error);
    if (reason.includes('10,000')) return 'TEXT_TOO_LONG';
    if (reason.includes('formula')) return 'FORMULA_NOT_ALLOWED';
    return 'UNSUPPORTED_CELL_VALUE';
  }

  private isRequiredError(error: AppError): boolean {
    return this.appErrorReason(error).includes('required field');
  }

  private appErrorReason(error: AppError): string {
    const details = error.details;
    if (
      details &&
      typeof details === 'object' &&
      'reason' in details &&
      typeof details.reason === 'string'
    ) {
      return details.reason;
    }
    return error.message;
  }

  private isFormulaValue(
    value: ExcelJS.CellValue,
  ): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
    return Boolean(
      value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value),
    );
  }

  private resolveCellValue(
    value: ExcelJS.CellValue,
    issue: Omit<EmployeeWorkbookValidationIssue, 'reason'>,
  ): ExcelJS.CellValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
      return value;
    }
    if (typeof value === 'boolean') {
      throw this.invalid('boolean cell values are not supported', issue);
    }
    if ('richText' in value) {
      return value.richText.map(({ text }) => text).join('');
    }
    if ('hyperlink' in value) {
      return value.text;
    }
    if ('formula' in value || 'sharedFormula' in value) {
      if (value.result === undefined) {
        throw this.invalid('formula has no safe cached result', issue);
      }
      return this.resolveCellValue(value.result, issue);
    }
    if ('error' in value) {
      throw this.invalid(`contains Excel error ${value.error}`, issue);
    }
    throw this.invalid('contains an unsupported Excel object value', issue);
  }

  private assertFile(buffer: Buffer): void {
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw this.invalid('XLSX file exceeds the 20 MiB limit');
    }
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      throw this.invalid('File must be a genuine XLSX ZIP archive');
    }
  }

  private formatUtcDate(value: Date): string {
    return [
      value.getUTCFullYear().toString().padStart(4, '0'),
      (value.getUTCMonth() + 1).toString().padStart(2, '0'),
      value.getUTCDate().toString().padStart(2, '0'),
    ].join('-');
  }

  private thinBorder(): Partial<ExcelJS.Borders> {
    const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFD9E2F3' } };
    return { top: side, left: side, bottom: side, right: side };
  }

  private invalid(
    reason: string,
    context: Omit<EmployeeWorkbookValidationIssue, 'reason'> = {},
    cause?: unknown,
  ): AppError {
    const location = [
      context.rowNumber === undefined ? null : `row ${context.rowNumber}`,
      context.field ?? null,
    ]
      .filter((part): part is string => part !== null)
      .join(' ');
    const message = location.length > 0 ? `${location}: ${reason}` : reason;
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_TEMPLATE_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { ...context, reason } satisfies EmployeeWorkbookValidationIssue,
      cause,
    });
  }
}
