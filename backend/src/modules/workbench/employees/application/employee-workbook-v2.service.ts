import { HttpStatus, Injectable } from '@nestjs/common';
import { EmployeeWorkStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  EmployeeWorkbookInspectionIssue,
  EmployeeWorkbookInspectionResult,
  EmployeeWorkbookProfileWarning,
  EmployeeWorkbookSourceSection,
  EmployeeWorkbookSourceRow,
  EmployeeWorkbookV2Meta,
  NormalizedEmployeeCurrentWorkRow,
  NormalizedEmployeeNextWeekPlanRow,
  NormalizedEmployeePlanPriority,
  NormalizedEmployeeWorkbookRow,
} from '../domain/employee-work.types';
import {
  EmployeeWorkbookFormat,
  V2_CURRENT_WORK_HEADERS,
  V2_NEXT_WEEK_PLAN_HEADERS,
} from './employee-workbook-format';

const MAX_CELL_TEXT_LENGTH = 10_000;
const CURRENT_FIRST_ROW = 7;
const CURRENT_LAST_ROW = 14;
const NEXT_FIRST_ROW = 20;
const NEXT_LAST_ROW = 25;
const MILLIS_PER_DAY = 86_400_000;

type NormalizedCellValue = string | number | null;

export interface EmployeeWorkbookV2TemplateEmployee {
  employeeName: string;
  department?: string | null;
  workDirection?: string | null;
}

export interface EmployeeWorkbookV2TemplateOptions {
  periodStart: string | Date;
  employees: EmployeeWorkbookV2TemplateEmployee[];
}

interface EmployeeSheetMeta {
  employeeName: string;
  department: string | null;
  workDirection: string | null;
  periodStart: string;
  periodEnd: string;
  nextPeriodStart: string;
  nextPeriodEnd: string;
}

interface DirectoryEntry {
  employeeName: string;
  department: string | null;
  workDirection: string | null;
}

interface WorksheetWithDataValidations extends ExcelJS.Worksheet {
  dataValidations: {
    add(address: string, validation: ExcelJS.DataValidation): void;
  };
}

const STATUS_MAP: Readonly<Record<string, EmployeeWorkStatus>> = {
  未开始: EmployeeWorkStatus.NOT_STARTED,
  进行中: EmployeeWorkStatus.IN_PROGRESS,
  已完成: EmployeeWorkStatus.COMPLETED,
  有风险: EmployeeWorkStatus.AT_RISK,
  已阻塞: EmployeeWorkStatus.BLOCKED,
};

const PRIORITY_MAP: Readonly<Record<string, NormalizedEmployeePlanPriority>> = {
  低: 'LOW',
  中: 'MEDIUM',
  高: 'HIGH',
  紧急: 'URGENT',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
  UNSPECIFIED: 'UNSPECIFIED',
};

@Injectable()
export class EmployeeWorkbookV2Service {
  async template(options: EmployeeWorkbookV2TemplateOptions): Promise<Buffer> {
    const periodStart = this.templatePeriodStart(options.periodStart);
    const periodEnd = this.addDays(periodStart, 6);
    const nextPeriodStart = this.addDays(periodStart, 7);
    const nextPeriodEnd = this.addDays(periodStart, 13);
    this.assertTemplateEmployees(options.employees);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RD Manager Workbench';
    workbook.created = new Date(0);
    workbook.modified = new Date(0);

    const instructions = workbook.addWorksheet('填写说明', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    this.configureInstructions(instructions, options.employees);
    for (const employee of options.employees) {
      const sheet = workbook.addWorksheet(employee.employeeName, {
        views: [{ state: 'frozen', ySplit: 6 }],
      });
      this.configureEmployeeSheet(sheet, employee, {
        periodStart,
        periodEnd,
        nextPeriodStart,
        nextPeriodEnd,
      });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  inspect(
    workbook: ExcelJS.Workbook,
    format: Extract<EmployeeWorkbookFormat, { version: 2 }>,
  ): EmployeeWorkbookInspectionResult {
    const directory = this.parseDirectory(workbook.getWorksheet('填写说明')!);
    const rows: NormalizedEmployeeWorkbookRow[] = [];
    const sourceRows: EmployeeWorkbookSourceRow[] = [];
    const issues: EmployeeWorkbookInspectionIssue[] = [];
    const profileWarnings: EmployeeWorkbookProfileWarning[] = [];
    let commonMeta: EmployeeSheetMeta | undefined;
    let globalRowNumber = 0;

    for (const sourceSheetName of format.employeeSheetNames) {
      const sheet = workbook.getWorksheet(sourceSheetName)!;
      const sheetMeta = this.parseSheetMeta(sheet, workbook.properties.date1904 === true);
      const directoryEntry = directory.get(sourceSheetName);
      if (!directoryEntry || sheetMeta.employeeName !== sourceSheetName) {
        throw this.invalid(
          `员工身份必须在填写说明、工作表名称和表内“员工姓名”三方一致：${sourceSheetName}`,
          { field: 'employeeName' },
        );
      }
      this.collectProfileWarnings(directoryEntry, sheetMeta, sourceSheetName, profileWarnings);
      if (!commonMeta) {
        commonMeta = sheetMeta;
      } else if (
        commonMeta.periodStart !== sheetMeta.periodStart ||
        commonMeta.periodEnd !== sheetMeta.periodEnd ||
        commonMeta.nextPeriodStart !== sheetMeta.nextPeriodStart ||
        commonMeta.nextPeriodEnd !== sheetMeta.nextPeriodEnd
      ) {
        throw this.invalid(`所有员工工作表必须属于同一周：${sourceSheetName}`, {
          field: 'period',
        });
      }

      for (const config of [
        {
          section: 'CURRENT_WORK' as const,
          firstRow: CURRENT_FIRST_ROW,
          lastRow: CURRENT_LAST_ROW,
        },
        {
          section: 'NEXT_WEEK_PLAN' as const,
          firstRow: NEXT_FIRST_ROW,
          lastRow: NEXT_LAST_ROW,
        },
      ]) {
        for (
          let sourceRowNumber = config.firstRow;
          sourceRowNumber <= config.lastRow;
          sourceRowNumber += 1
        ) {
          const parsed = this.inspectDataRow(
            sheet,
            sourceRowNumber,
            config.section,
            sheetMeta,
            globalRowNumber + 1,
            workbook.properties.date1904 === true,
          );
          if (parsed.isBlank) continue;
          globalRowNumber += 1;
          sourceRows.push(parsed.sourceRow);
          issues.push(...parsed.issues);
          if (parsed.row) rows.push(parsed.row);
        }
      }
    }
    if (!commonMeta) throw this.invalid('V2 周报必须至少包含一张员工工作表');

    const meta: EmployeeWorkbookV2Meta = {
      templateVersion: 2,
      periodType: 'WEEK',
      periodStart: commonMeta.periodStart,
      periodEnd: commonMeta.periodEnd,
      nextPeriodStart: commonMeta.nextPeriodStart,
      nextPeriodEnd: commonMeta.nextPeriodEnd,
      employeeSheetCount: format.employeeSheetNames.length,
    };
    return { meta, rows, sourceRows, issues, profileWarnings };
  }

  private configureInstructions(
    sheet: ExcelJS.Worksheet,
    employees: EmployeeWorkbookV2TemplateEmployee[],
  ): void {
    sheet.mergeCells('A1:C1');
    sheet.getCell('A1').value = '员工周报填写说明';
    sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    sheet.getCell('A2').value = '模板版本';
    sheet.getCell('B2').value = 2;
    sheet.getCell('A3').value =
      '黄色区域用于填写；不要修改工作表名称、元信息、表头或自动汇总公式。';
    sheet.mergeCells('A3:C3');
    sheet.getRow(4).values = ['员工姓名', '部门', '工作方向'];
    employees.forEach((employee, index) => {
      sheet.getRow(index + 5).values = [
        employee.employeeName,
        employee.department ?? null,
        employee.workDirection ?? null,
      ];
    });
    sheet.columns = [{ width: 24 }, { width: 24 }, { width: 32 }];
    this.styleHeader(sheet.getRow(4));
  }

  private configureEmployeeSheet(
    sheet: ExcelJS.Worksheet,
    employee: EmployeeWorkbookV2TemplateEmployee,
    dates: {
      periodStart: string;
      periodEnd: string;
      nextPeriodStart: string;
      nextPeriodEnd: string;
    },
  ): void {
    sheet.getRow(1).values = [
      '员工姓名',
      employee.employeeName,
      '部门',
      employee.department ?? null,
      '工作方向',
      employee.workDirection ?? null,
    ];
    sheet.getRow(2).values = [
      '本周起始日期',
      this.utcDate(dates.periodStart),
      '本周结束日期',
      this.utcDate(dates.periodEnd),
      '模板版本',
      2,
    ];
    sheet.getRow(3).values = [
      '下周起始日期',
      { formula: 'B2+7', result: this.utcDate(dates.nextPeriodStart) },
      '下周结束日期',
      { formula: 'D2+7', result: this.utcDate(dates.nextPeriodEnd) },
    ];
    for (const address of ['B2', 'D2', 'B3', 'D3']) sheet.getCell(address).numFmt = 'yyyy-mm-dd';

    sheet.mergeCells('A5:H5');
    sheet.getCell('A5').value = '本周工作';
    sheet.getRow(6).values = [...V2_CURRENT_WORK_HEADERS];
    for (let rowNumber = CURRENT_FIRST_ROW; rowNumber <= CURRENT_LAST_ROW; rowNumber += 1) {
      sheet.getCell(rowNumber, 1).value = rowNumber - CURRENT_FIRST_ROW + 1;
      sheet.getCell(rowNumber, 5).value = '未开始';
      sheet.getCell(rowNumber, 6).value = 0;
      sheet.getCell(rowNumber, 6).numFmt = '0%';
      this.styleEditableRow(sheet.getRow(rowNumber));
    }
    sheet.getCell('A16').value = '自动汇总';
    sheet.getCell('B16').value = {
      formula: 'COUNTIF(B7:B14,"?*")',
      result: 0,
    };
    sheet.getCell('C16').value = {
      formula: 'COUNTIF(E7:E14,"已完成")',
      result: 0,
    };

    sheet.mergeCells('A18:H18');
    sheet.getCell('A18').value = '下周工作计划';
    sheet.getRow(19).values = [...V2_NEXT_WEEK_PLAN_HEADERS];
    for (let rowNumber = NEXT_FIRST_ROW; rowNumber <= NEXT_LAST_ROW; rowNumber += 1) {
      sheet.getCell(rowNumber, 1).value = rowNumber - NEXT_FIRST_ROW + 1;
      this.styleEditableRow(sheet.getRow(rowNumber));
    }

    this.styleSection(sheet.getCell('A5'));
    this.styleSection(sheet.getCell('A18'));
    this.styleHeader(sheet.getRow(6));
    this.styleHeader(sheet.getRow(19));
    sheet.columns = [
      { width: 9 },
      { width: 28 },
      { width: 32 },
      { width: 16 },
      { width: 14 },
      { width: 16 },
      { width: 32 },
      { width: 32 },
    ];
    const validations = (sheet as WorksheetWithDataValidations).dataValidations;
    validations.add('E7:E14', {
      type: 'list',
      formulae: ['"未开始,进行中,已完成,有风险,已阻塞"'],
      allowBlank: false,
    });
    validations.add('F7:F14', {
      type: 'decimal',
      operator: 'between',
      formulae: [0, 1],
      allowBlank: true,
    });
    validations.add('E20:E25', {
      type: 'list',
      formulae: ['"低,中,高,紧急"'],
      allowBlank: true,
    });
  }

  private styleHeader(row: ExcelJS.Row): void {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  private styleSection(cell: ExcelJS.Cell): void {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  }

  private styleEditableRow(row: ExcelJS.Row): void {
    row.height = 30;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      if (columnNumber > 8) return;
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
    });
  }

  private parseDirectory(sheet: ExcelJS.Worksheet): Map<string, DirectoryEntry> {
    if (
      this.text(sheet.getCell('A4')) !== '员工姓名' ||
      this.text(sheet.getCell('B4')) !== '部门' ||
      this.text(sheet.getCell('C4')) !== '工作方向'
    ) {
      throw this.invalid('填写说明的员工目录表头必须位于 A4:C4', { field: 'directory' });
    }
    const version = this.scalar(sheet.getCell('B2'), false);
    if (version !== 2 && version !== '2') {
      throw this.invalid('填写说明中的模板版本必须为 2', { field: 'templateVersion' });
    }
    const result = new Map<string, DirectoryEntry>();
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < 5) return;
      for (let columnNumber = 1; columnNumber <= 3; columnNumber += 1) {
        if (!this.isFormula(row.getCell(columnNumber).value)) continue;
        throw this.invalid('填写说明员工目录不允许公式', {
          rowNumber,
          field: row.getCell(columnNumber).address,
        });
      }
      const employeeName = this.text(row.getCell(1));
      if (!employeeName) return;
      if (result.has(employeeName)) {
        throw this.invalid(`填写说明员工目录存在重复姓名：${employeeName}`, {
          rowNumber,
          field: 'employeeName',
        });
      }
      result.set(employeeName, {
        employeeName,
        department: this.text(row.getCell(2)),
        workDirection: this.text(row.getCell(3)),
      });
    });
    return result;
  }

  private parseSheetMeta(sheet: ExcelJS.Worksheet, date1904: boolean): EmployeeSheetMeta {
    const expectedLabels: Array<[string, string]> = [
      ['A1', '员工姓名'],
      ['C1', '部门'],
      ['E1', '工作方向'],
      ['A2', '本周起始日期'],
      ['C2', '本周结束日期'],
      ['E2', '模板版本'],
      ['A3', '下周起始日期'],
      ['C3', '下周结束日期'],
    ];
    for (const [address, expected] of expectedLabels) {
      if (this.text(sheet.getCell(address)) !== expected) {
        throw this.invalid(`员工工作表 ${sheet.name} 的元信息标签 ${address} 必须为 ${expected}`, {
          field: address,
        });
      }
    }
    const version = this.scalar(sheet.getCell('F2'), false);
    if (version !== 2 && version !== '2') {
      throw this.invalid(`员工工作表 ${sheet.name} 的模板版本必须为 2`, {
        field: 'templateVersion',
      });
    }
    const periodStart = this.date(sheet.getCell('B2'), date1904, 'periodStart');
    const periodEnd = this.date(sheet.getCell('D2'), date1904, 'periodEnd');
    this.assertWeek(periodStart, periodEnd, sheet.name);
    const expectedNextStart = this.addDays(periodStart, 7);
    const expectedNextEnd = this.addDays(periodStart, 13);
    this.assertKnownMetadataFormula(sheet.getCell('B3'), 'B2+7', sheet.name);
    this.assertKnownMetadataFormula(sheet.getCell('D3'), 'D2+7', sheet.name);
    const nextPeriodStart = this.date(sheet.getCell('B3'), date1904, 'nextPeriodStart', true);
    const nextPeriodEnd = this.date(sheet.getCell('D3'), date1904, 'nextPeriodEnd', true);
    if (nextPeriodStart !== expectedNextStart || nextPeriodEnd !== expectedNextEnd) {
      throw this.invalid(`员工工作表 ${sheet.name} 的下周周期必须紧接本周周期`, {
        field: 'nextPeriod',
      });
    }
    return {
      employeeName: this.requiredText(sheet.getCell('B1'), 'employeeName'),
      department: this.text(sheet.getCell('D1')),
      workDirection: this.text(sheet.getCell('F1')),
      periodStart,
      periodEnd,
      nextPeriodStart,
      nextPeriodEnd,
    };
  }

  private inspectDataRow(
    sheet: ExcelJS.Worksheet,
    sourceRowNumber: number,
    sourceSection: EmployeeWorkbookSourceSection,
    meta: EmployeeSheetMeta,
    globalRowNumber: number,
    date1904: boolean,
  ): {
    isBlank: boolean;
    row?: NormalizedEmployeeWorkbookRow;
    sourceRow: EmployeeWorkbookSourceRow;
    issues: EmployeeWorkbookInspectionIssue[];
  } {
    const headers =
      sourceSection === 'CURRENT_WORK' ? V2_CURRENT_WORK_HEADERS : V2_NEXT_WEEK_PLAN_HEADERS;
    const rawValues: Record<string, NormalizedCellValue> = {};
    const issues: EmployeeWorkbookInspectionIssue[] = [];
    const values: NormalizedCellValue[] = [];
    for (let index = 0; index < headers.length; index += 1) {
      const cell = sheet.getCell(sourceRowNumber, index + 1);
      const header = headers[index];
      if (this.isFormula(cell.value)) {
        values.push(null);
        rawValues[header] = this.safeRaw(cell.value);
        issues.push(
          this.issue(
            globalRowNumber,
            sheet.name,
            sourceSection,
            sourceRowNumber,
            header,
            this.safeRaw(cell.value),
            'FORMULA_NOT_ALLOWED',
            '可填写区域不允许公式、共享公式或外部引用',
          ),
        );
        continue;
      }
      try {
        const normalized = this.scalar(cell, false);
        values.push(normalized);
        rawValues[header] = normalized;
      } catch (error) {
        values.push(null);
        rawValues[header] = this.safeRaw(cell.value);
        issues.push(
          this.issue(
            globalRowNumber,
            sheet.name,
            sourceSection,
            sourceRowNumber,
            header,
            this.safeRaw(cell.value),
            'UNSUPPORTED_CELL_VALUE',
            error instanceof Error ? error.message : '单元格值无效',
          ),
        );
      }
    }

    const isBlank =
      sourceSection === 'CURRENT_WORK' ? this.isBlankCurrent(values) : this.isBlankNext(values);
    const sourceRow: EmployeeWorkbookSourceRow = {
      rowNumber: globalRowNumber,
      sourceSheetName: sheet.name,
      sourceSection,
      sourceRowNumber,
      rawValues,
    };
    if (isBlank && issues.length === 0) return { isBlank: true, sourceRow, issues };

    const row =
      sourceSection === 'CURRENT_WORK'
        ? this.currentRow(
            values,
            rawValues,
            meta,
            sheet.name,
            sourceRowNumber,
            globalRowNumber,
            date1904,
            issues,
          )
        : this.nextRow(
            values,
            rawValues,
            meta,
            sheet.name,
            sourceRowNumber,
            globalRowNumber,
            date1904,
            issues,
          );
    return { isBlank: false, sourceRow, issues, row: issues.length === 0 ? row : undefined };
  }

  private currentRow(
    values: NormalizedCellValue[],
    rawValues: Record<string, NormalizedCellValue>,
    meta: EmployeeSheetMeta,
    sourceSheetName: string,
    sourceRowNumber: number,
    rowNumber: number,
    date1904: boolean,
    issues: EmployeeWorkbookInspectionIssue[],
  ): NormalizedEmployeeCurrentWorkRow | undefined {
    const title = this.requiredRowText(
      values[1],
      '本周工作内容',
      sourceSheetName,
      'CURRENT_WORK',
      sourceRowNumber,
      rowNumber,
      issues,
    );
    const statusText = this.rowText(values[4]);
    const status = statusText ? STATUS_MAP[statusText] : undefined;
    if (!status) {
      issues.push(
        this.issue(
          rowNumber,
          sourceSheetName,
          'CURRENT_WORK',
          sourceRowNumber,
          '状态',
          values[4],
          statusText ? 'INVALID_VALUE' : 'REQUIRED_FIELD',
          statusText ? '状态必须为未开始、进行中、已完成、有风险或已阻塞' : '状态为必填项',
        ),
      );
    }
    const completionRate = this.completion(
      values[5],
      sourceSheetName,
      sourceRowNumber,
      rowNumber,
      issues,
    );
    const plannedCompletionAt = this.optionalRowDate(
      values[3],
      sourceSheetName,
      'CURRENT_WORK',
      sourceRowNumber,
      rowNumber,
      '计划完成日期',
      date1904,
      issues,
    );
    if (!title || !status) return undefined;
    const summaryText = this.rowText(values[6]);
    return {
      sourceSection: 'CURRENT_WORK',
      sourceSheetName,
      sourceRowNumber,
      rowNumber,
      employeeName: meta.employeeName,
      department: meta.department,
      workDirection: meta.workDirection,
      title,
      planText: this.rowText(values[2]),
      plannedCompletionAt,
      summaryText,
      completionRate,
      status,
      nextPlanText: this.rowText(values[7]),
      riskText:
        (status === EmployeeWorkStatus.AT_RISK || status === EmployeeWorkStatus.BLOCKED) &&
        summaryText
          ? summaryText
          : null,
      plannedHours: null,
      actualHours: null,
      projectCode: null,
      taskCode: null,
      note: null,
      rawValues,
    };
  }

  private nextRow(
    values: NormalizedCellValue[],
    rawValues: Record<string, NormalizedCellValue>,
    meta: EmployeeSheetMeta,
    sourceSheetName: string,
    sourceRowNumber: number,
    rowNumber: number,
    date1904: boolean,
    issues: EmployeeWorkbookInspectionIssue[],
  ): NormalizedEmployeeNextWeekPlanRow | undefined {
    const title = this.requiredRowText(
      values[1],
      '下周重点工作',
      sourceSheetName,
      'NEXT_WEEK_PLAN',
      sourceRowNumber,
      rowNumber,
      issues,
    );
    const priorityText = this.rowText(values[4]);
    const priority = priorityText ? PRIORITY_MAP[priorityText] : 'UNSPECIFIED';
    if (!priority) {
      issues.push(
        this.issue(
          rowNumber,
          sourceSheetName,
          'NEXT_WEEK_PLAN',
          sourceRowNumber,
          '优先级',
          values[4],
          'INVALID_VALUE',
          '优先级必须为低、中、高、紧急或留空',
        ),
      );
    }
    const plannedCompletionAt = this.optionalRowDate(
      values[3],
      sourceSheetName,
      'NEXT_WEEK_PLAN',
      sourceRowNumber,
      rowNumber,
      '计划完成日期',
      date1904,
      issues,
    );
    if (!title || !priority) return undefined;
    return {
      sourceSection: 'NEXT_WEEK_PLAN',
      sourceSheetName,
      sourceRowNumber,
      rowNumber,
      employeeName: meta.employeeName,
      department: meta.department,
      workDirection: meta.workDirection,
      title,
      deliverableText: this.rowText(values[2]),
      plannedCompletionAt,
      priority,
      collaborationText: this.rowText(values[5]),
      planText: this.rowText(values[6]),
      note: this.rowText(values[7]),
      rawValues,
    };
  }

  private requiredRowText(
    value: NormalizedCellValue,
    field: string,
    sourceSheetName: string,
    sourceSection: EmployeeWorkbookSourceSection,
    sourceRowNumber: number,
    rowNumber: number,
    issues: EmployeeWorkbookInspectionIssue[],
  ): string | undefined {
    const text = this.rowText(value);
    if (text) return text;
    issues.push(
      this.issue(
        rowNumber,
        sourceSheetName,
        sourceSection,
        sourceRowNumber,
        field,
        value,
        'REQUIRED_FIELD',
        `${field}为必填项`,
      ),
    );
    return undefined;
  }

  private completion(
    value: NormalizedCellValue,
    sourceSheetName: string,
    sourceRowNumber: number,
    rowNumber: number,
    issues: EmployeeWorkbookInspectionIssue[],
  ): number | null {
    if (value === null) return null;
    let parsed: number;
    if (typeof value === 'number') parsed = value >= 0 && value <= 1 ? value * 100 : value;
    else {
      const match = /^(\d+(?:\.\d+)?)%$/.exec(value);
      parsed = match ? Number(match[1]) : Number.NaN;
    }
    const rounded = Math.round(parsed);
    if (
      !Number.isFinite(parsed) ||
      Math.abs(parsed - rounded) > 1e-8 ||
      rounded < 0 ||
      rounded > 100
    ) {
      issues.push(
        this.issue(
          rowNumber,
          sourceSheetName,
          'CURRENT_WORK',
          sourceRowNumber,
          '完成进度',
          value,
          'INVALID_VALUE',
          '完成进度必须为 0 到 100 的整数或百分比',
        ),
      );
      return null;
    }
    return rounded;
  }

  private optionalRowDate(
    value: NormalizedCellValue,
    sourceSheetName: string,
    sourceSection: EmployeeWorkbookSourceSection,
    sourceRowNumber: number,
    rowNumber: number,
    field: string,
    date1904: boolean,
    issues: EmployeeWorkbookInspectionIssue[],
  ): string | null {
    if (value === null) return null;
    try {
      return this.dateValue(value, date1904, field);
    } catch (error) {
      issues.push(
        this.issue(
          rowNumber,
          sourceSheetName,
          sourceSection,
          sourceRowNumber,
          field,
          value,
          'INVALID_VALUE',
          error instanceof Error ? error.message : '日期无效',
        ),
      );
      return null;
    }
  }

  private collectProfileWarnings(
    directory: DirectoryEntry,
    sheet: EmployeeSheetMeta,
    sourceSheetName: string,
    warnings: EmployeeWorkbookProfileWarning[],
  ): void {
    for (const field of ['department', 'workDirection'] as const) {
      if (directory[field] === sheet[field]) continue;
      warnings.push({
        employeeName: sheet.employeeName,
        sourceSheetName,
        field,
        instructionValue: directory[field],
        sheetValue: sheet[field],
        reason: `${field === 'department' ? '部门' : '工作方向'}在填写说明与员工工作表中不一致`,
      });
    }
  }

  private assertKnownMetadataFormula(
    cell: ExcelJS.Cell,
    expectedFormula: string,
    sheetName: string,
  ): void {
    if (!this.isFormula(cell.value)) return;
    if (
      'sharedFormula' in cell.value ||
      cell.value.formula.replace(/\s+/g, '').toUpperCase() !== expectedFormula.toUpperCase()
    ) {
      throw this.invalid(
        `员工工作表 ${sheetName} 的 ${cell.address} 只允许模板公式 ${expectedFormula}`,
        { field: cell.address },
      );
    }
  }

  private isBlankCurrent(values: NormalizedCellValue[]): boolean {
    const businessIsBlank = [values[1], values[2], values[3], values[6], values[7]].every(
      (value) => this.rowText(value) === null,
    );
    const status = this.rowText(values[4]);
    const completion = values[5];
    const defaultCompletion =
      completion === null || completion === 0 || completion === '0' || completion === '0%';
    return businessIsBlank && (status === null || status === '未开始') && defaultCompletion;
  }

  private isBlankNext(values: NormalizedCellValue[]): boolean {
    return values.slice(1).every((value) => this.rowText(value) === null);
  }

  private issue(
    rowNumber: number,
    sourceSheetName: string,
    sourceSection: EmployeeWorkbookSourceSection,
    sourceRowNumber: number,
    field: string,
    rawValue: NormalizedCellValue,
    code: EmployeeWorkbookInspectionIssue['code'],
    reason: string,
  ): EmployeeWorkbookInspectionIssue {
    return {
      code,
      rowNumber,
      sourceSheetName,
      sourceSection,
      sourceRowNumber,
      field,
      rawValue,
      reason,
    };
  }

  private scalar(cell: ExcelJS.Cell, allowFormula: boolean): NormalizedCellValue {
    if (this.isFormula(cell.value) && !allowFormula) throw new Error('单元格不允许公式');
    const value = this.resolve(cell.value);
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('单元格必须包含有限数字');
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > MAX_CELL_TEXT_LENGTH) throw new Error('文本超过 10,000 个字符');
      const normalized = value.trim();
      return normalized.length === 0 ? null : normalized;
    }
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new Error('日期无效');
      return this.formatDate(value);
    }
    if (typeof value === 'object' && 'richText' in value) {
      const text = value.richText.map(({ text: part }) => part).join('');
      if (text.length > MAX_CELL_TEXT_LENGTH) throw new Error('文本超过 10,000 个字符');
      const normalized = text.trim();
      return normalized.length === 0 ? null : normalized;
    }
    throw new Error('包含不支持的 Excel 单元格值');
  }

  private resolve(value: ExcelJS.CellValue): ExcelJS.CellValue {
    if (this.isFormula(value)) return value.result ?? null;
    return value;
  }

  private text(cell: ExcelJS.Cell): string | null {
    const value = this.scalar(cell, false);
    return this.rowText(value);
  }

  private requiredText(cell: ExcelJS.Cell, field: string): string {
    const value = this.text(cell);
    if (!value) throw this.invalid(`${field} 为必填项`, { field });
    return value;
  }

  private rowText(value: NormalizedCellValue): string | null {
    if (value === null) return null;
    const text = String(value).trim();
    return text.length === 0 ? null : text;
  }

  private date(cell: ExcelJS.Cell, date1904: boolean, field: string, allowFormula = false): string {
    if (this.isFormula(cell.value) && !allowFormula) {
      throw this.invalid(`${field} 不允许公式`, { field });
    }
    try {
      return this.dateValue(this.resolve(cell.value), date1904, field);
    } catch (error) {
      throw this.invalid(error instanceof Error ? error.message : `${field} 日期无效`, { field });
    }
  }

  private dateValue(
    value: ExcelJS.CellValue | NormalizedCellValue,
    date1904: boolean,
    field: string,
  ): string {
    if (value instanceof Date) {
      if (
        !Number.isFinite(value.getTime()) ||
        value.getUTCHours() !== 0 ||
        value.getUTCMinutes() !== 0 ||
        value.getUTCSeconds() !== 0 ||
        value.getUTCMilliseconds() !== 0
      ) {
        throw new Error(`${field} 必须是不含时间的 Excel 日期`);
      }
      return this.assertDateRange(this.formatDate(value), field);
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) throw new Error(`${field} 必须是不含时间的 Excel 日期`);
      const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
      return this.assertDateRange(this.formatDate(new Date(epoch + value * MILLIS_PER_DAY)), field);
    }
    if (typeof value === 'string') {
      const normalized = value.trim();
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
      if (!match) throw new Error(`${field} 必须使用 YYYY-MM-DD`);
      const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (this.formatDate(parsed) !== normalized) throw new Error(`${field} 不是有效日期`);
      return this.assertDateRange(normalized, field);
    }
    throw new Error(`${field} 为必填日期`);
  }

  private assertWeek(periodStart: string, periodEnd: string, sheetName: string): void {
    const start = Date.parse(`${periodStart}T00:00:00.000Z`);
    const end = Date.parse(`${periodEnd}T00:00:00.000Z`);
    if (
      new Date(start).getUTCDay() !== 1 ||
      new Date(end).getUTCDay() !== 0 ||
      end - start !== 6 * MILLIS_PER_DAY
    ) {
      throw this.invalid(`员工工作表 ${sheetName} 的周期必须为周一至对应周日`, {
        field: 'period',
      });
    }
  }

  private assertDateRange(value: string, field: string): string {
    const year = Number(value.slice(0, 4));
    if (year < 2000 || year > 2100) throw new Error(`${field} 年份必须在 2000 到 2100 之间`);
    return value;
  }

  private templatePeriodStart(value: string | Date): string {
    if (
      value instanceof Date &&
      (!Number.isFinite(value.getTime()) ||
        value.getUTCHours() !== 0 ||
        value.getUTCMinutes() !== 0 ||
        value.getUTCSeconds() !== 0 ||
        value.getUTCMilliseconds() !== 0)
    ) {
      throw this.invalid('periodStart 必须是不含时间或时区偏移的 UTC midnight 日期', {
        field: 'periodStart',
      });
    }
    const normalized =
      value instanceof Date ? this.formatDate(value) : this.dateValue(value, false, 'periodStart');
    const date = this.utcDate(normalized);
    if (date.getUTCDay() !== 1) {
      throw this.invalid('periodStart 必须为周一', { field: 'periodStart' });
    }
    return normalized;
  }

  private assertTemplateEmployees(employees: EmployeeWorkbookV2TemplateEmployee[]): void {
    if (employees.length === 0) throw this.invalid('V2 模板至少需要一名员工');
    const names = new Set<string>();
    for (const employee of employees) {
      const name = employee.employeeName.trim();
      if (
        name.length === 0 ||
        name.length > 31 ||
        /[\\/*?:[\]]/.test(name) ||
        name === '填写说明' ||
        name.startsWith('_rdmw_')
      ) {
        throw this.invalid(`员工姓名不能作为 Excel 工作表名称：${employee.employeeName}`, {
          field: 'employeeName',
        });
      }
      if (names.has(name)) throw this.invalid(`员工姓名重复：${name}`, { field: 'employeeName' });
      names.add(name);
    }
  }

  private safeRaw(value: ExcelJS.CellValue): NormalizedCellValue {
    if (this.isFormula(value)) {
      const formula = 'formula' in value ? value.formula : value.sharedFormula;
      return `'=${String(formula ?? '').slice(0, MAX_CELL_TEXT_LENGTH - 2)}`;
    }
    try {
      return this.scalarValue(value);
    } catch {
      return null;
    }
  }

  private scalarValue(value: ExcelJS.CellValue): NormalizedCellValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value.slice(0, MAX_CELL_TEXT_LENGTH);
    if (value instanceof Date)
      return Number.isFinite(value.getTime()) ? this.formatDate(value) : null;
    if (typeof value === 'object' && 'richText' in value) {
      return value.richText
        .map(({ text }) => text)
        .join('')
        .slice(0, MAX_CELL_TEXT_LENGTH);
    }
    return null;
  }

  private isFormula(
    value: ExcelJS.CellValue,
  ): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
    return (
      typeof value === 'object' &&
      value !== null &&
      ('formula' in value || 'sharedFormula' in value)
    );
  }

  private formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private utcDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private addDays(value: string, days: number): string {
    return this.formatDate(new Date(Date.parse(`${value}T00:00:00.000Z`) + days * MILLIS_PER_DAY));
  }

  private invalid(message: string, details?: { rowNumber?: number; field?: string }): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_TEMPLATE_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
