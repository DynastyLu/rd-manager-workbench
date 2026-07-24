import {
  canonicalJson,
  employeeImportFingerprint,
} from '../../../../src/modules/workbench/employees/application/employee-import-fingerprint';

describe('employeeImportFingerprint', () => {
  it('is stable across recursive object key order while retaining resolution state', () => {
    const common = {
      fileHash: 'file-hash',
      templateVersion: 1,
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
    };
    const left = employeeImportFingerprint({
      ...common,
      rows: [
        {
          rowNumber: 2,
          rawValues: { b: 2, nested: { z: 1, a: 2 }, a: 1 },
          normalizedValues: { title: 'work', employeeName: '张明' },
          status: 'UNRESOLVED',
          errors: [{ reason: 'missing', code: 'PROJECT_NOT_FOUND', field: '项目编号' }],
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: false,
        },
      ],
    });
    const right = employeeImportFingerprint({
      ...common,
      rows: [
        {
          keepUnlinked: false,
          resolvedTaskId: null,
          resolvedProjectId: null,
          resolvedEmployeeId: 'employee-1',
          errors: [{ field: '项目编号', code: 'PROJECT_NOT_FOUND', reason: 'missing' }],
          status: 'UNRESOLVED',
          normalizedValues: { employeeName: '张明', title: 'work' },
          rawValues: { a: 1, nested: { a: 2, z: 1 }, b: 2 },
          rowNumber: 2,
        },
      ],
    });
    const changedResolution = employeeImportFingerprint({
      ...common,
      rows: [
        {
          rowNumber: 2,
          rawValues: { a: 1, nested: { a: 2, z: 1 }, b: 2 },
          normalizedValues: { employeeName: '张明', title: 'work' },
          status: 'UNRESOLVED',
          errors: [{ field: '项目编号', code: 'PROJECT_NOT_FOUND', reason: 'missing' }],
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: true,
        },
      ],
    });

    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(right).toBe(left);
    expect(changedResolution).not.toBe(left);
  });

  it('sorts canonical object keys without locale-dependent comparison', () => {
    const localeCompare = jest.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
      throw new Error('localeCompare must not be used');
    });
    try {
      expect(canonicalJson({ ä: 1, z: 2, A: 3 })).toBe('{"A":3,"z":2,"ä":1}');
    } finally {
      localeCompare.mockRestore();
    }
  });
});
