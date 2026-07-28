import { EmployeeImportRowStatus, EmployeeWorkStatus } from '@prisma/client';
import { parseStoredEmployeeImportRow } from '../../../../src/modules/workbench/employees/application/employee-import-staged-row';

function currentWorkRow() {
  return {
    rowNumber: 2,
    sourceSection: 'CURRENT_WORK',
    sourceSheetName: '匿名员工',
    sourceRowNumber: 7,
    employeeName: '匿名员工',
    department: '研发部',
    workDirection: '平台工程',
    title: '实现导入链路',
    planText: '通过自动化测试',
    plannedCompletionAt: '2026-07-24',
    summaryText: '完成预览',
    completionRate: 80,
    status: EmployeeWorkStatus.IN_PROGRESS,
    nextPlanText: '完成落库',
    riskText: null,
    plannedHours: null,
    actualHours: null,
    projectCode: null,
    taskCode: null,
    note: null,
    rawValues: { 本周工作内容: '实现导入链路' },
  };
}

function storedV2Row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-2',
    batchId: 'batch-1',
    rowNumber: 2,
    sourceSheetName: '匿名员工',
    sourceSection: 'CURRENT_WORK',
    sourceRowNumber: 7,
    sourceKey: '匿名员工:CURRENT_WORK:7',
    rawValues: { 本周工作内容: '实现导入链路' },
    normalizedValues: currentWorkRow(),
    status: EmployeeImportRowStatus.VALID,
    errors: [],
    resolvedEmployeeId: 'employee-1',
    resolvedProjectId: 'project-1',
    resolvedTaskId: null,
    keepUnlinked: false,
    workKind: 'PROJECT',
    plannedHours: 8,
    actualHours: 7.5,
    profileAction: 'KEEP',
    riskDecision: 'REMOVE',
    riskText: null,
    ...overrides,
  };
}

describe('parseStoredEmployeeImportRow V2', () => {
  it('preserves source coordinates and administrator confirmations', () => {
    expect(parseStoredEmployeeImportRow(storedV2Row() as never)).toMatchObject({
      rowNumber: 2,
      sourceSheetName: '匿名员工',
      sourceSection: 'CURRENT_WORK',
      sourceRowNumber: 7,
      sourceKey: '匿名员工:CURRENT_WORK:7',
      workKind: 'PROJECT',
      plannedHours: 8,
      actualHours: 7.5,
      profileAction: 'KEEP',
      riskDecision: 'REMOVE',
      riskText: null,
    });
  });

  it.each([
    { sourceKey: '匿名员工:CURRENT_WORK:8' },
    { sourceSection: 'UNKNOWN' },
    { sourceRowNumber: null },
    { workKind: 'UNKNOWN' },
    { profileAction: 'OVERWRITE' },
    { riskDecision: 'IGNORE' },
    { plannedHours: -1 },
    { actualHours: 10_000 },
  ])('rejects malformed staged metadata %j', (override) => {
    expect(() => parseStoredEmployeeImportRow(storedV2Row(override) as never)).toThrow(
      expect.objectContaining({ code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED' }),
    );
  });
});
