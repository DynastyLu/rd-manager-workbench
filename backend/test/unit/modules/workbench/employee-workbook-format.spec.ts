import ExcelJS from 'exceljs';
import {
  detectEmployeeWorkbookFormat,
  V1_EMPLOYEE_WORK_HEADERS,
  V2_CURRENT_WORK_HEADERS,
  V2_NEXT_WEEK_PLAN_HEADERS,
} from '../../../../src/modules/workbench/employees/application/employee-workbook-format';

function addHeaders(sheet: ExcelJS.Worksheet, rowNumber: number, headers: readonly string[]): void {
  sheet.getRow(rowNumber).values = [...headers];
}

function v1Workbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const instructions = workbook.addWorksheet('说明');
  instructions.getCell('B3').value = 1;
  addHeaders(workbook.addWorksheet('工作明细'), 1, V1_EMPLOYEE_WORK_HEADERS);
  return workbook;
}

function v2Workbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('填写说明');
  for (const employeeName of ['匿名员工乙', '匿名员工甲']) {
    const sheet = workbook.addWorksheet(employeeName);
    sheet.getCell('A1').value = '员工姓名';
    sheet.getCell('B1').value = employeeName;
    addHeaders(sheet, 6, V2_CURRENT_WORK_HEADERS);
    addHeaders(sheet, 19, V2_NEXT_WEEK_PLAN_HEADERS);
  }
  return workbook;
}

describe('employee workbook format detection', () => {
  it('detects the exact V1 flat workbook', () => {
    expect(detectEmployeeWorkbookFormat(v1Workbook())).toEqual({
      version: 1,
      kind: 'FLAT',
    });
  });

  it('detects V2 employee sheets independently of their order', () => {
    const workbook = v2Workbook();

    expect(detectEmployeeWorkbookFormat(workbook)).toEqual({
      version: 2,
      kind: 'EMPLOYEE_SHEETS',
      employeeSheetNames: ['匿名员工乙', '匿名员工甲'],
    });
  });

  it('rejects a V2 workbook without 填写说明', () => {
    const workbook = v2Workbook();
    workbook.removeWorksheet(workbook.getWorksheet('填写说明')!.id);

    expect(() => detectEmployeeWorkbookFormat(workbook)).toThrow(/填写说明/);
  });

  it('rejects an employee sheet whose fixed headers were changed', () => {
    const workbook = v2Workbook();
    workbook.getWorksheet('匿名员工甲')!.getCell('B6').value = '改名字段';

    expect(() => detectEmployeeWorkbookFormat(workbook)).toThrow(/匿名员工甲.*第 6 行表头/);
  });

  it('rejects an unknown workbook without guessing a column mapping', () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1').addRow(['姓名', '周报']);

    expect(() => detectEmployeeWorkbookFormat(workbook)).toThrow(/无法识别周报模板/);
  });
});
