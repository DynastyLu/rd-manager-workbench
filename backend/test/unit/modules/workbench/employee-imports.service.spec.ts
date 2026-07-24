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
    fileHash: 'hash',
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
}) {
  const tx = {
    employeeWorkImportRow: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    employeeWorkImportBatch: {
      update: jest.fn().mockImplementation(({ data }) => batch(data)),
    },
  };
  const prisma = {
    employeeWorkImportBatch: {
      findFirst: jest.fn().mockResolvedValue(options.existingBatch ?? null),
      findUnique: jest.fn().mockResolvedValue(options.foundBatch ?? batch()),
      create: jest.fn().mockImplementation(({ data }) => batch(data)),
      update: jest.fn().mockImplementation(({ data }) => batch(data)),
    },
    employeeWorkItem: { create: jest.fn() },
    $transaction: jest.fn().mockImplementation((work) => work(tx)),
  };
  const storage = {
    write: jest.fn().mockResolvedValue({ storageKey: 'stored', size: 4 }),
    read: jest.fn().mockResolvedValue({
      content: Buffer.from('xlsx'),
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
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
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

    const created = dependencies.prisma.employeeWorkImportBatch.create.mock.calls[0][0].data;
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
    expect(dependencies.prisma.employeeWorkImportBatch.create).not.toHaveBeenCalled();
    expect(dependencies.audit.record).not.toHaveBeenCalled();
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
        errorStorageKey: 'employee-imports/batch-1/errors.xlsx',
      }),
    });
    expect(dependencies.storage.write).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'employee-imports/batch-1/errors.xlsx',
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
    );
    expect(dependencies.tx.employeeWorkImportRow.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({
        status: EmployeeImportRowStatus.VALID,
        errors: [],
        keepUnlinked: true,
      }),
    });
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
    );
  });

  it('rejects cleanup for committed states and removes both draft files before expiring a draft', async () => {
    const committed = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.COMPLETED,
        expiresAt: new Date('2026-07-23T00:00:00.000Z'),
      }),
    });
    await expect(committed.service.remove('batch-1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(committed.storage.delete).not.toHaveBeenCalled();

    const draft = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.RESOLVING,
        errorStorageKey: 'employee-imports/batch-1/errors.xlsx',
      }),
    });
    await draft.service.remove('batch-1');
    expect(draft.storage.delete).toHaveBeenCalledWith('employee-imports/batch-1/source.xlsx');
    expect(draft.storage.delete).toHaveBeenCalledWith('employee-imports/batch-1/errors.xlsx');
    expect(draft.prisma.employeeWorkImportBatch.findUnique).toHaveBeenCalled();
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
