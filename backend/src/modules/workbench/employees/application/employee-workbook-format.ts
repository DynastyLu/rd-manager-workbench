import ExcelJS from 'exceljs';

export const V1_EMPLOYEE_WORK_HEADERS = [
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

export const V2_CURRENT_WORK_HEADERS = [
  '序号',
  '本周工作内容',
  '具体任务 / 预期交付',
  '计划完成日期',
  '状态',
  '完成进度',
  '本周成果 / 问题',
  '下周计划',
] as const;

export const V2_NEXT_WEEK_PLAN_HEADERS = [
  '序号',
  '下周重点工作',
  '具体任务 / 预期交付',
  '计划完成日期',
  '优先级',
  '所需协作 / 资源',
  '计划说明',
  '备注',
] as const;

export type EmployeeWorkbookFormat =
  | { version: 1; kind: 'FLAT' }
  | {
      version: 2;
      kind: 'EMPLOYEE_SHEETS';
      employeeSheetNames: string[];
    };

export class EmployeeWorkbookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmployeeWorkbookFormatError';
  }
}

function normalizedCellValue(cell: ExcelJS.Cell): string | number | null {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }
  if (typeof value === 'object' && 'richText' in value) {
    const normalized = value.richText
      .map(({ text }) => text)
      .join('')
      .trim();
    return normalized.length === 0 ? null : normalized;
  }
  return null;
}

function hasExactHeaders(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  expected: readonly string[],
): boolean {
  const row = sheet.getRow(rowNumber);
  for (let index = 0; index < expected.length; index += 1) {
    if (normalizedCellValue(row.getCell(index + 1)) !== expected[index]) return false;
  }
  let hasExtra = false;
  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    if (columnNumber > expected.length && normalizedCellValue(cell) !== null) hasExtra = true;
  });
  return !hasExtra;
}

function isV1(workbook: ExcelJS.Workbook): boolean {
  if (
    workbook.worksheets.length !== 2 ||
    workbook.worksheets[0]?.name !== '说明' ||
    workbook.worksheets[1]?.name !== '工作明细'
  ) {
    return false;
  }
  const version = normalizedCellValue(workbook.worksheets[0].getCell('B3'));
  return (
    (version === 1 || version === '1') &&
    hasExactHeaders(workbook.worksheets[1], 1, V1_EMPLOYEE_WORK_HEADERS)
  );
}

function isV1Candidate(workbook: ExcelJS.Workbook): boolean {
  return Boolean(workbook.getWorksheet('说明') && workbook.getWorksheet('工作明细'));
}

function visibleEmployeeSheets(workbook: ExcelJS.Workbook): ExcelJS.Worksheet[] {
  return workbook.worksheets.filter(
    (sheet) => sheet.name !== '填写说明' && !sheet.name.startsWith('_rdmw_'),
  );
}

function resemblesEmployeeSheet(sheet: ExcelJS.Worksheet): boolean {
  return (
    normalizedCellValue(sheet.getCell('A1')) === '员工姓名' ||
    hasExactHeaders(sheet, 6, V2_CURRENT_WORK_HEADERS) ||
    hasExactHeaders(sheet, 19, V2_NEXT_WEEK_PLAN_HEADERS)
  );
}

export function detectEmployeeWorkbookFormat(workbook: ExcelJS.Workbook): EmployeeWorkbookFormat {
  if (isV1(workbook)) return { version: 1, kind: 'FLAT' };
  if (isV1Candidate(workbook)) return { version: 1, kind: 'FLAT' };
  if (workbook.getWorksheet('工作明细')) {
    throw new EmployeeWorkbookFormatError('Workbook is missing required V1 sheet 说明');
  }
  if (workbook.getWorksheet('说明')) {
    throw new EmployeeWorkbookFormatError('Workbook is missing required V1 sheet 工作明细');
  }

  const instructions = workbook.getWorksheet('填写说明');
  const possibleEmployeeSheets = visibleEmployeeSheets(workbook);
  if (!instructions) {
    if (possibleEmployeeSheets.some(resemblesEmployeeSheet)) {
      throw new EmployeeWorkbookFormatError('V2 周报缺少“填写说明”工作表');
    }
    throw new EmployeeWorkbookFormatError(
      `无法识别周报模板；已发现工作表：${workbook.worksheets.map(({ name }) => name).join('、') || '无'}`,
    );
  }
  if (possibleEmployeeSheets.length === 0) {
    throw new EmployeeWorkbookFormatError('V2 周报必须至少包含一张员工工作表');
  }

  for (const sheet of workbook.worksheets) {
    if (!sheet.name.startsWith('_rdmw_')) continue;
    if (sheet.state === 'visible') {
      throw new EmployeeWorkbookFormatError(`辅助工作表 ${sheet.name} 必须隐藏，无法识别周报模板`);
    }
  }
  for (const sheet of possibleEmployeeSheets) {
    if (!hasExactHeaders(sheet, 6, V2_CURRENT_WORK_HEADERS)) {
      throw new EmployeeWorkbookFormatError(
        `员工工作表 ${sheet.name} 的第 6 行表头与 V2 协议不一致`,
      );
    }
    if (!hasExactHeaders(sheet, 19, V2_NEXT_WEEK_PLAN_HEADERS)) {
      throw new EmployeeWorkbookFormatError(
        `员工工作表 ${sheet.name} 的第 19 行表头与 V2 协议不一致`,
      );
    }
  }

  return {
    version: 2,
    kind: 'EMPLOYEE_SHEETS',
    employeeSheetNames: possibleEmployeeSheets.map(({ name }) => name),
  };
}
