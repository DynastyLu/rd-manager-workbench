import { createHash } from 'node:crypto';
import {
  EmployeeImportRowStatus,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
} from '@prisma/client';
import { EmployeeImportsService } from '../../../../src/modules/workbench/employees/application/employee-imports.service';
import {
  EmployeeWorkbookInspectionResult,
  NormalizedEmployeeWorkRow,
} from '../../../../src/modules/workbench/employees/domain/employee-work.types';

const NOW = new Date('2026-07-24T00:00:00.000Z');
const SOURCE = Buffer.from('xlsx');
const SOURCE_HASH = createHash('sha256').update(SOURCE).digest('hex');

function normalizedRow(
  overrides: Partial<NormalizedEmployeeWorkRow> = {},
): NormalizedEmployeeWorkRow {
  return {
    rowNumber: 2,
    employeeName: '张明',
    title: '实现员工周报导入',
    planText: '完成接口设计',
    summaryText: '完成开发',
    completionRate: 90,
    status: EmployeeWorkStatus.IN_PROGRESS,
    nextPlanText: '联调',
    riskText: null,
    plannedHours: 8,
    actualHours: 7,
    projectCode: 'RD-026',
    taskCode: 'TASK-001',
    note: null,
    rawValues: {
      员工姓名: '张明',
      工作内容: '实现员工周报导入',
      项目编号: 'RD-026',
      任务编号: 'TASK-001',
    },
    ...overrides,
  };
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    periodType: 'WEEK',
    periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
    periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
    version: null,
    status: EmployeeWorkImportStatus.UPLOADED,
    originalName: 'weekly.xlsx',
    fileHash: SOURCE_HASH,
    sourceStorageKey: 'employee-imports/batch-1/source.xlsx',
    errorStorageKey: null,
    templateVersion: 1,
    previewFingerprint: null,
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    unresolvedRows: 0,
    importedRows: 0,
    expiresAt: new Date('2026-07-25T00:00:00.000Z'),
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createService(options: {
  existingBatch?: ReturnType<typeof batch> | null;
  foundBatch?: ReturnType<typeof batch> | null;
  inspection?: ReturnType<typeof inspection>;
  validation?: unknown[];
  auditFailure?: Error;
}) {
  const foundBatch = options.foundBatch ?? batch();
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    employeeWorkImportRow: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue((foundBatch as any)?.rows ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    employeeWorkImportBatch: {
      findFirst: jest.fn().mockResolvedValue(options.existingBatch ?? null),
      findUnique: jest.fn().mockResolvedValue(foundBatch),
      create: jest.fn().mockImplementation(({ data }) => batch(data)),
      update: jest.fn().mockImplementation(({ data }) => batch(data)),
    },
  };
  const prisma = {
    employeeWorkImportBatch: {
      findFirst: jest.fn().mockResolvedValue(options.existingBatch ?? null),
      findUnique: jest.fn().mockResolvedValue(foundBatch),
      create: jest.fn().mockImplementation(({ data }) => batch(data)),
      update: jest.fn().mockImplementation(({ data }) => batch(data)),
    },
    employeeWorkItem: { create: jest.fn() },
    $transaction: jest.fn().mockImplementation((work) => work(tx)),
  };
  const storage = {
    write: jest.fn().mockResolvedValue({ storageKey: 'stored', size: 4 }),
    read: jest.fn().mockResolvedValue({
      content: SOURCE,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const workbook = {
    inspect: jest.fn().mockResolvedValue(options.inspection ?? inspection()),
  };
  const validator = {
    validate: jest.fn().mockResolvedValue(
      options.validation ?? [
        {
          row: normalizedRow(),
          status: EmployeeImportRowStatus.VALID,
          errors: [],
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: 'project-1',
          resolvedTaskId: 'task-1',
          keepUnlinked: false,
        },
      ],
    ),
  };
  const audit = {
    record: options.auditFailure
      ? jest.fn().mockRejectedValue(options.auditFailure)
      : jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  return {
    service: new EmployeeImportsService(
      prisma as never,
      storage as never,
      workbook as never,
      validator as never,
      audit as never,
      () => NOW,
    ),
    prisma,
    storage,
    workbook,
    validator,
    audit,
    tx,
  };
}

function inspection(): EmployeeWorkbookInspectionResult {
  return {
    meta: {
      templateVersion: 1 as const,
      periodType: 'WEEK' as const,
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
    },
    rows: [normalizedRow()],
    sourceRows: [{ rowNumber: 2, rawValues: normalizedRow().rawValues }],
    issues: [],
  };
}

describe('EmployeeImportsService', () => {
  it('hashes, sanitizes, stores, creates, and audits a new upload without exposing storage keys', async () => {
    const dependencies = createService({});
    const content = Buffer.from('xlsx');

    const result = await dependencies.service.upload({
      originalname: '../unsafe/\u0000weekly.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: content.length,
      buffer: content,
    });

    const created = dependencies.tx.employeeWorkImportBatch.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      originalName: 'weekly.xlsx',
      fileHash: createHash('sha256').update(content).digest('hex'),
      sourceStorageKey: `employee-imports/${created.id}/source.xlsx`,
      status: EmployeeWorkImportStatus.UPLOADED,
      templateVersion: 1,
    });
    expect(dependencies.storage.write).toHaveBeenCalledWith({
      key: created.sourceStorageKey,
      content,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_IMPORT_UPLOADED',
        entityType: 'employeeWorkImportBatch',
        entityId: created.id,
        outcome: 'SUCCEEDED',
      }),
      dependencies.tx,
    );
    expect(result).not.toHaveProperty('sourceStorageKey');
    expect(result).not.toHaveProperty('errorStorageKey');
    expect(result).not.toHaveProperty('previewFingerprint');
  });

  it('returns a non-expired batch for the same period and hash without storing twice', async () => {
    const existing = batch({ id: 'existing-batch' });
    const dependencies = createService({ existingBatch: existing });

    const result = await dependencies.service.upload({
      originalname: 'weekly.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 4,
      buffer: Buffer.from('xlsx'),
    });

    expect(result).toMatchObject({ id: 'existing-batch' });
    expect(dependencies.storage.write).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.create).not.toHaveBeenCalled();
    expect(dependencies.audit.record).not.toHaveBeenCalled();
  });

  it('rejects upload MIME types outside canonical XLSX and octet-stream', async () => {
    const dependencies = createService({});

    await expect(
      dependencies.service.upload({
        originalname: 'weekly.xlsx',
        mimetype: 'text/plain',
        size: SOURCE.length,
        buffer: SOURCE,
      }),
    ).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
      statusCode: 422,
    });
    expect(dependencies.workbook.inspect).not.toHaveBeenCalled();
    expect(dependencies.storage.write).not.toHaveBeenCalled();
  });

  it('deletes the winning upload source when the transactional audit insert fails', async () => {
    const dependencies = createService({ auditFailure: new Error('audit failed') });

    await expect(
      dependencies.service.upload({
        originalname: 'weekly.xlsx',
        mimetype: 'application/octet-stream',
        size: SOURCE.length,
        buffer: SOURCE,
      }),
    ).rejects.toThrow('audit failed');

    const created = dependencies.tx.employeeWorkImportBatch.create.mock.calls[0][0].data;
    expect(dependencies.storage.write).toHaveBeenCalledWith({
      key: created.sourceStorageKey,
      content: SOURCE,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_UPLOADED' }),
      dependencies.tx,
    );
    expect(dependencies.storage.delete).toHaveBeenCalledWith(created.sourceStorageKey);
  });

  it('acquires the upload advisory lock before the in-transaction duplicate check', async () => {
    const dependencies = createService({});

    await dependencies.service.upload({
      originalname: 'weekly.xlsx',
      mimetype: 'application/octet-stream',
      size: SOURCE.length,
      buffer: SOURCE,
    });

    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(dependencies.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.tx.employeeWorkImportBatch.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('previews into staged rows in one transaction and never writes formal work items', async () => {
    const invalidSource = {
      rowNumber: 3,
      rawValues: { 员工姓名: '未知', 工作内容: null },
    };
    const workbookResult = {
      ...inspection(),
      sourceRows: [...inspection().sourceRows, invalidSource],
      issues: [
        {
          rowNumber: 3,
          field: '工作内容',
          code: 'REQUIRED_FIELD' as const,
          rawValue: null,
          reason: 'required field is blank',
        },
      ],
    };
    const unresolved = {
      row: normalizedRow(),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [
        {
          field: '项目编号',
          code: 'PROJECT_NOT_FOUND',
          rawValue: 'RD-026',
          reason: 'project not found',
        },
      ],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
    };
    const dependencies = createService({
      inspection: workbookResult,
      validation: [unresolved],
    });

    const result = await dependencies.service.preview('batch-1');

    expect(dependencies.tx.employeeWorkImportRow.deleteMany).toHaveBeenCalledWith({
      where: { batchId: 'batch-1' },
    });
    expect(dependencies.tx.employeeWorkImportRow.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          batchId: 'batch-1',
          rowNumber: 2,
          status: EmployeeImportRowStatus.UNRESOLVED,
        }),
        expect.objectContaining({
          batchId: 'batch-1',
          rowNumber: 3,
          status: EmployeeImportRowStatus.ERROR,
        }),
      ]),
    });
    expect(dependencies.tx.employeeWorkImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: expect.objectContaining({
        status: EmployeeWorkImportStatus.PREVIEWED,
        totalRows: 2,
        validRows: 0,
        errorRows: 1,
        unresolvedRows: 1,
        previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        errorStorageKey: expect.stringMatching(
          /^employee-imports\/batch-1\/errors\/[a-f0-9]{64}\.xlsx$/,
        ),
      }),
    });
    expect(dependencies.storage.write).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^employee-imports\/batch-1\/errors\/[a-f0-9]{64}\.xlsx$/),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    expect(dependencies.prisma.employeeWorkItem.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: EmployeeWorkImportStatus.PREVIEWED,
      totalRows: 2,
      errorRows: 1,
      unresolvedRows: 1,
      hasErrors: true,
    });
    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_PREVIEWED' }),
      dependencies.tx,
    );
  });

  it('rejects a source hash mismatch before parsing or writing staged state', async () => {
    const dependencies = createService({
      foundBatch: batch({ fileHash: createHash('sha256').update('original').digest('hex') }),
    });

    await expect(dependencies.service.preview('batch-1')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED',
      statusCode: 422,
    });

    expect(dependencies.workbook.inspect).not.toHaveBeenCalled();
    expect(dependencies.storage.write).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportRow.deleteMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalled();
    expect(dependencies.audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['template version', { templateVersion: 2 }],
    ['period type', { periodType: 'MONTH' }],
    ['period start', { periodStart: '2026-07-13' }],
    ['period end', { periodEnd: '2026-07-27' }],
  ])('rejects preview when stored source %s differs from the batch', async (_label, meta) => {
    const dependencies = createService({
      inspection: { ...inspection(), meta: { ...inspection().meta, ...meta } } as never,
    });

    await expect(dependencies.service.preview('batch-1')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED',
      statusCode: 422,
    });

    expect(dependencies.storage.write).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportRow.deleteMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalled();
    expect(dependencies.audit.record).not.toHaveBeenCalled();
  });

  it('cleans only a new preview artifact when its transactional audit fails', async () => {
    const oldKey = 'employee-imports/batch-1/errors/old.xlsx';
    const dependencies = createService({
      auditFailure: new Error('audit failed'),
      foundBatch: batch({ errorStorageKey: oldKey }),
      inspection: {
        ...inspection(),
        rows: [],
        sourceRows: [{ rowNumber: 2, rawValues: { 员工姓名: null } }],
        issues: [
          {
            code: 'REQUIRED_FIELD',
            rowNumber: 2,
            field: '员工姓名',
            rawValue: null,
            reason: 'required',
          },
        ],
      },
      validation: [],
    });

    await expect(dependencies.service.preview('batch-1')).rejects.toThrow('audit failed');

    const newKey = dependencies.storage.write.mock.calls[0][0].key as string;
    expect(newKey).toMatch(/^employee-imports\/batch-1\/errors\/[a-f0-9]{64}\.xlsx$/);
    expect(newKey).not.toBe(oldKey);
    expect(dependencies.storage.delete).toHaveBeenCalledWith(newKey);
    expect(dependencies.storage.delete).not.toHaveBeenCalledWith(oldKey);
  });

  it('marks a clean preview ready and removes an obsolete error workbook', async () => {
    const dependencies = createService({
      foundBatch: batch({
        errorStorageKey: 'employee-imports/batch-1/errors.xlsx',
      }),
    });

    const result = await dependencies.service.preview('batch-1');

    expect(dependencies.tx.employeeWorkImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: expect.objectContaining({
        status: EmployeeWorkImportStatus.READY,
        validRows: 1,
        errorRows: 0,
        unresolvedRows: 0,
        errorStorageKey: null,
      }),
    });
    expect(dependencies.storage.delete).toHaveBeenCalledWith(
      'employee-imports/batch-1/errors.xlsx',
    );
    expect(result).toMatchObject({ status: EmployeeWorkImportStatus.READY, hasErrors: false });
  });

  it('revalidates explicit resolutions and recomputes counts and fingerprint', async () => {
    const staged = {
      id: 'row-1',
      batchId: 'batch-1',
      rowNumber: 2,
      rawValues: normalizedRow().rawValues,
      normalizedValues: normalizedRow(),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [{ field: '项目编号', code: 'PROJECT_NOT_FOUND' }],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
    };
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
        errorStorageKey: 'employee-imports/batch-1/errors.xlsx',
      }),
      validation: [
        {
          row: normalizedRow(),
          status: EmployeeImportRowStatus.VALID,
          errors: [],
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: true,
        },
      ],
    });

    const result = await dependencies.service.resolve('batch-1', {
      rows: [
        {
          rowNumber: 2,
          employeeId: 'employee-1',
          projectId: null,
          taskId: null,
          keepUnlinked: true,
        },
      ],
    });

    expect(dependencies.validator.validate).toHaveBeenCalledWith(
      [expect.objectContaining({ rowNumber: 2 })],
      new Map([
        [
          2,
          {
            employeeId: 'employee-1',
            projectId: null,
            taskId: null,
            keepUnlinked: true,
          },
        ],
      ]),
      dependencies.tx,
    );
    expect(dependencies.tx.employeeWorkImportRow.update).not.toHaveBeenCalled();
    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(dependencies.tx.employeeWorkImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: expect.objectContaining({
        status: EmployeeWorkImportStatus.READY,
        validRows: 1,
        errorRows: 0,
        unresolvedRows: 0,
        previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        errorStorageKey: null,
      }),
    });
    expect(result).toMatchObject({ status: EmployeeWorkImportStatus.READY });
    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_RESOLVED' }),
      dependencies.tx,
    );
  });

  it('preserves the old resolve artifact and removes only the new one on audit failure', async () => {
    const oldKey = 'employee-imports/batch-1/errors/old.xlsx';
    const stagedRows = [2, 3].map((rowNumber) => ({
      id: `row-${rowNumber}`,
      batchId: 'batch-1',
      rowNumber,
      rawValues: normalizedRow({ rowNumber }).rawValues,
      normalizedValues: normalizedRow({ rowNumber }),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [{ field: '项目编号', code: 'PROJECT_NOT_FOUND' }],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
    }));
    const dependencies = createService({
      auditFailure: new Error('audit failed'),
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: stagedRows,
        totalRows: 2,
        unresolvedRows: 2,
        previewFingerprint: 'preview-fingerprint',
        errorStorageKey: oldKey,
      }),
    });

    await expect(
      dependencies.service.resolve('batch-1', {
        rows: [{ rowNumber: 2, keepUnlinked: true }],
      }),
    ).rejects.toThrow('audit failed');

    const newKey = dependencies.storage.write.mock.calls[0][0].key as string;
    expect(newKey).toMatch(/^employee-imports\/batch-1\/errors\/[a-f0-9]{64}\.xlsx$/);
    expect(newKey).not.toBe(oldKey);
    expect(dependencies.storage.delete).toHaveBeenCalledWith(newKey);
    expect(dependencies.storage.delete).not.toHaveBeenCalledWith(oldKey);
  });

  it.each([
    ['raw values', { rawValues: [] }],
    ['normalized values', { normalizedValues: { employeeName: '张明' } }],
    ['errors', { errors: { code: 'PROJECT_NOT_FOUND' } }],
  ])('rejects malformed persisted %s with a typed integrity error', async (_label, malformed) => {
    const staged = {
      id: 'row-1',
      batchId: 'batch-1',
      rowNumber: 2,
      rawValues: normalizedRow().rawValues,
      normalizedValues: normalizedRow(),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
      ...malformed,
    };
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
      }),
    });

    await expect(
      dependencies.service.resolve('batch-1', {
        rows: [{ rowNumber: 2, keepUnlinked: true }],
      }),
    ).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED',
      statusCode: 422,
    });
    expect(dependencies.validator.validate).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalled();
  });

  it.each([
    ['empty required text', { normalizedValues: normalizedRow({ employeeName: '' }) }],
    ['oversized nullable text', { normalizedValues: normalizedRow({ note: 'x'.repeat(10_001) }) }],
    ['fractional completion rate', { normalizedValues: normalizedRow({ completionRate: 90.5 }) }],
    ['out-of-range hours', { normalizedValues: normalizedRow({ plannedHours: 10_000 }) }],
    ['over-precise hours', { normalizedValues: normalizedRow({ actualHours: 1.001 }) }],
    ['oversized raw text', { rawValues: { 工作内容: 'x'.repeat(10_001) } }],
    [
      'oversized error reason',
      { errors: [{ field: '项目编号', code: 'PROJECT_NOT_FOUND', reason: 'x'.repeat(1_001) }] },
    ],
    ['mismatched normalized row number', { normalizedValues: normalizedRow({ rowNumber: 3 }) }],
  ])('enforces persisted Task3 boundary: %s', async (_label, malformed) => {
    const staged = {
      id: 'row-1',
      batchId: 'batch-1',
      rowNumber: 2,
      rawValues: normalizedRow().rawValues,
      normalizedValues: normalizedRow(),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
      ...malformed,
    };
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
      }),
    });

    await expect(
      dependencies.service.resolve('batch-1', {
        rows: [{ rowNumber: 2, keepUnlinked: true }],
      }),
    ).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED',
      statusCode: 422,
    });
  });

  it('queries batch metadata and staged rows separately during resolution', async () => {
    const staged = {
      id: 'row-1',
      batchId: 'batch-1',
      rowNumber: 2,
      rawValues: normalizedRow().rawValues,
      normalizedValues: normalizedRow(),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
    };
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
      }),
    });

    await dependencies.service.resolve('batch-1', {
      rows: [{ rowNumber: 2, keepUnlinked: true }],
    });

    expect(dependencies.tx.employeeWorkImportBatch.findUnique).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
    });
    expect(dependencies.tx.employeeWorkImportRow.findMany).toHaveBeenCalledWith({
      where: { batchId: 'batch-1' },
      orderBy: { rowNumber: 'asc' },
    });
  });

  it('updates large resolution sets in bounded bulk statements', async () => {
    const stagedRows = Array.from({ length: 205 }, (_, index) => {
      const rowNumber = index + 2;
      return {
        id: `row-${rowNumber}`,
        batchId: 'batch-1',
        rowNumber,
        rawValues: normalizedRow({ rowNumber }).rawValues,
        normalizedValues: normalizedRow({ rowNumber }),
        status: EmployeeImportRowStatus.UNRESOLVED,
        errors: [],
        resolvedEmployeeId: 'employee-1',
        resolvedProjectId: null,
        resolvedTaskId: null,
        keepUnlinked: false,
      };
    });
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: stagedRows,
        totalRows: stagedRows.length,
        previewFingerprint: 'preview-fingerprint',
      }),
    });
    dependencies.validator.validate.mockImplementation(async (rows) =>
      rows.map((row) => ({
        row,
        status: EmployeeImportRowStatus.VALID,
        errors: [],
        resolvedEmployeeId: 'employee-1',
        resolvedProjectId: null,
        resolvedTaskId: null,
        keepUnlinked: true,
      })),
    );

    await dependencies.service.resolve('batch-1', {
      rows: stagedRows.map(({ rowNumber }) => ({ rowNumber, keepUnlinked: true })),
    });

    expect(dependencies.tx.employeeWorkImportRow.update).not.toHaveBeenCalled();
    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it.each([
    {
      label: 'never previewed',
      value: batch({
        status: EmployeeWorkImportStatus.UPLOADED,
        rows: [],
        totalRows: 0,
        previewFingerprint: null,
      }),
    },
    {
      label: 'missing fingerprint',
      value: batch({
        status: EmployeeWorkImportStatus.PREVIEWED,
        rows: [
          {
            id: 'row-1',
            batchId: 'batch-1',
            rowNumber: 2,
            rawValues: normalizedRow().rawValues,
            normalizedValues: normalizedRow(),
            status: EmployeeImportRowStatus.UNRESOLVED,
            errors: [],
            resolvedEmployeeId: 'employee-1',
            resolvedProjectId: null,
            resolvedTaskId: null,
            keepUnlinked: false,
          },
        ],
        totalRows: 1,
        previewFingerprint: null,
      }),
    },
    {
      label: 'incomplete staged rows',
      value: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [],
        totalRows: 1,
        previewFingerprint: 'fingerprint',
      }),
    },
  ])('rejects resolutions for a batch that is $label', async ({ value }) => {
    const dependencies = createService({ foundBatch: value });

    await expect(dependencies.service.resolve('batch-1', { rows: [] })).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
    });

    expect(dependencies.validator.validate).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalled();
  });

  it('keeps unresolved references undefined when a resolution does not change them', async () => {
    const staged = {
      id: 'row-1',
      batchId: 'batch-1',
      rowNumber: 2,
      rawValues: normalizedRow({ taskCode: 'TASK-404' }).rawValues,
      normalizedValues: normalizedRow({ taskCode: 'TASK-404' }),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [{ field: '任务编号', code: 'TASK_NOT_FOUND' }],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
    };
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
      }),
    });

    await dependencies.service.resolve('batch-1', {
      rows: [{ rowNumber: 2, projectId: 'project-1' }],
    });

    expect(dependencies.validator.validate).toHaveBeenCalledWith(
      [expect.objectContaining({ rowNumber: 2, taskCode: 'TASK-404' })],
      new Map([
        [
          2,
          {
            employeeId: 'employee-1',
            projectId: 'project-1',
            taskId: undefined,
            keepUnlinked: false,
          },
        ],
      ]),
      dependencies.tx,
    );
  });

  it.each([
    EmployeeWorkImportStatus.UPLOADED,
    EmployeeWorkImportStatus.PREVIEWED,
    EmployeeWorkImportStatus.RESOLVING,
    EmployeeWorkImportStatus.READY,
    EmployeeWorkImportStatus.FAILED,
  ])('cleans an expired %s draft and marks it EXPIRED', async (status) => {
    const draft = createService({
      foundBatch: batch({
        status,
        expiresAt: new Date('2026-07-23T00:00:00.000Z'),
        errorStorageKey: 'employee-imports/batch-1/errors.xlsx',
      }),
    });

    await draft.service.remove('batch-1');

    expect(draft.storage.delete).toHaveBeenCalledWith('employee-imports/batch-1/source.xlsx');
    expect(draft.storage.delete).toHaveBeenCalledWith('employee-imports/batch-1/errors.xlsx');
    expect(draft.tx.employeeWorkImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: {
        status: EmployeeWorkImportStatus.EXPIRED,
        archivedAt: NOW,
        errorStorageKey: null,
      },
    });
    expect(draft.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(draft.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_EXPIRED' }),
      draft.tx,
    );
  });

  it('does not delete active files when the transactional remove audit fails', async () => {
    const dependencies = createService({
      auditFailure: new Error('audit failed'),
      foundBatch: batch({
        status: EmployeeWorkImportStatus.READY,
        errorStorageKey: 'employee-imports/batch-1/errors/current.xlsx',
      }),
    });

    await expect(dependencies.service.remove('batch-1')).rejects.toThrow('audit failed');

    expect(dependencies.storage.delete).not.toHaveBeenCalled();
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_EXPIRED' }),
      dependencies.tx,
    );
  });

  it('serializes remove ahead of preview so the waiting preview cannot revive EXPIRED', async () => {
    let current = batch({
      status: EmployeeWorkImportStatus.READY,
      totalRows: 1,
      validRows: 1,
      previewFingerprint: 'preview-fingerprint',
    });
    const dependencies = createService({ foundBatch: current });
    dependencies.tx.employeeWorkImportBatch.findUnique.mockImplementation(async () => current);
    dependencies.tx.employeeWorkImportBatch.update.mockImplementation(async ({ data }) => {
      current = batch({ ...current, ...data });
      return current;
    });
    let barrier = Promise.resolve();
    dependencies.prisma.$transaction.mockImplementation((work) => {
      const pending = barrier.then(() => work(dependencies.tx));
      barrier = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    });

    const removing = dependencies.service.remove('batch-1');
    const previewing = dependencies.service.preview('batch-1');
    const [removed, previewed] = await Promise.allSettled([removing, previewing]);

    expect(removed.status).toBe('fulfilled');
    expect(previewed).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'EMPLOYEE_IMPORT_EXPIRED' }),
    });
    expect(current.status).toBe(EmployeeWorkImportStatus.EXPIRED);
    expect(dependencies.tx.employeeWorkImportRow.deleteMany).not.toHaveBeenCalled();
  });

  it('serializes two resolutions and makes the second requery the first result', async () => {
    const stagedRows = [2, 3].map((rowNumber) => ({
      id: `row-${rowNumber}`,
      batchId: 'batch-1',
      rowNumber,
      rawValues: normalizedRow({ rowNumber }).rawValues,
      normalizedValues: normalizedRow({ rowNumber }),
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [{ field: '项目编号', code: 'PROJECT_NOT_FOUND' }],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
    }));
    let currentRows: any[] = stagedRows;
    let current = batch({
      status: EmployeeWorkImportStatus.RESOLVING,
      totalRows: 2,
      unresolvedRows: 2,
      previewFingerprint: 'preview-fingerprint',
      rows: currentRows,
    });
    const dependencies = createService({ foundBatch: current });
    dependencies.validator.validate.mockImplementation(async (rows) =>
      rows.map((row) => ({
        row,
        status: EmployeeImportRowStatus.VALID,
        errors: [],
        resolvedEmployeeId: 'employee-1',
        resolvedProjectId: null,
        resolvedTaskId: null,
        keepUnlinked: true,
      })),
    );
    dependencies.tx.employeeWorkImportBatch.findUnique.mockImplementation(async () => ({
      ...current,
    }));
    dependencies.tx.employeeWorkImportRow.findMany.mockImplementation(async () => currentRows);
    let sqlCall = 0;
    dependencies.tx.$executeRaw.mockImplementation(async () => {
      sqlCall += 1;
      if (sqlCall % 2 === 0) {
        const rowNumber = sqlCall === 2 ? 2 : 3;
        currentRows = currentRows.map((row) =>
          row.rowNumber === rowNumber
            ? { ...row, status: EmployeeImportRowStatus.VALID, keepUnlinked: true }
            : row,
        );
      }
      return 1;
    });
    dependencies.tx.employeeWorkImportBatch.update.mockImplementation(async ({ data }) => {
      current = batch({ ...current, ...data, rows: currentRows });
      return current;
    });
    let barrier = Promise.resolve();
    dependencies.prisma.$transaction.mockImplementation((work) => {
      const pending = barrier.then(() => work(dependencies.tx));
      barrier = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    });

    const first = dependencies.service.resolve('batch-1', {
      rows: [{ rowNumber: 2, keepUnlinked: true }],
    });
    const second = dependencies.service.resolve('batch-1', {
      rows: [{ rowNumber: 3, keepUnlinked: true }],
    });
    await Promise.all([first, second]);

    expect(dependencies.tx.employeeWorkImportBatch.findUnique).toHaveBeenCalledTimes(2);
    expect(dependencies.tx.employeeWorkImportBatch.update.mock.calls[1][0].data).toMatchObject({
      validRows: 2,
      unresolvedRows: 0,
      status: EmployeeWorkImportStatus.READY,
    });
    expect(currentRows.map(({ status }) => status)).toEqual([
      EmployeeImportRowStatus.VALID,
      EmployeeImportRowStatus.VALID,
    ]);
  });

  it.each([
    EmployeeWorkImportStatus.IMPORTING,
    EmployeeWorkImportStatus.COMPLETED,
    EmployeeWorkImportStatus.SUPERSEDED,
  ])('rejects cleanup for %s even after its TTL', async (status) => {
    const protectedBatch = createService({
      foundBatch: batch({
        status,
        expiresAt: new Date('2026-07-23T00:00:00.000Z'),
      }),
    });

    await expect(protectedBatch.service.remove('batch-1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(protectedBatch.storage.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['preview', (service: EmployeeImportsService) => service.preview('batch-1')],
    ['resolve', (service: EmployeeImportsService) => service.resolve('batch-1', { rows: [] })],
    ['error download', (service: EmployeeImportsService) => service.errorFile('batch-1')],
  ])('keeps expired drafts unavailable to %s', async (_label, operation) => {
    const expired = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.READY,
        expiresAt: new Date('2026-07-23T00:00:00.000Z'),
      }),
    });

    await expect(operation(expired.service)).rejects.toMatchObject({
      statusCode: 410,
    });
  });

  it('downloads only the stored error workbook for a live batch', async () => {
    const dependencies = createService({
      foundBatch: batch({
        errorStorageKey: 'employee-imports/batch-1/errors.xlsx',
      }),
    });

    const result = await dependencies.service.errorFile('batch-1');

    expect(dependencies.storage.read).toHaveBeenCalledWith('employee-imports/batch-1/errors.xlsx');
    expect(result).toMatchObject({
      fileName: 'weekly-错误行.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  });
});
