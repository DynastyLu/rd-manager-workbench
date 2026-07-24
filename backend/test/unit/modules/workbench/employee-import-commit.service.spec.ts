import {
  EmployeeImportRowStatus,
  EmployeeSnapshotStatus,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  LoadEntryKind,
} from '@prisma/client';
import { EmployeeImportCommitService } from '../../../../src/modules/workbench/employees/application/employee-import-commit.service';
import { employeeImportFingerprint } from '../../../../src/modules/workbench/employees/application/employee-import-fingerprint';

const NOW = new Date('2026-07-24T08:00:00.000Z');

function normalizedRow(rowNumber: number, overrides: Record<string, unknown> = {}) {
  const rawValues = { 员工姓名: '张明', 工作内容: `工作 ${rowNumber}` };
  return {
    rowNumber,
    employeeName: '张明',
    title: `工作 ${rowNumber}`,
    planText: null,
    summaryText: null,
    completionRate: 50,
    status: EmployeeWorkStatus.IN_PROGRESS,
    nextPlanText: null,
    riskText: null,
    plannedHours: 8,
    actualHours: 4,
    projectCode: 'RD-026',
    taskCode: 'TASK-001',
    note: null,
    rawValues,
    ...overrides,
  };
}

function stagedRow(rowNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `source-row-${rowNumber}`,
    batchId: 'batch-v2',
    rowNumber,
    rawValues: normalizedRow(rowNumber).rawValues,
    normalizedValues: normalizedRow(rowNumber),
    status: EmployeeImportRowStatus.VALID,
    errors: [],
    resolvedEmployeeId: 'employee-1',
    resolvedProjectId: 'project-1',
    resolvedTaskId: 'task-1',
    keepUnlinked: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function fingerprint(rows: ReturnType<typeof stagedRow>[]) {
  return employeeImportFingerprint({
    fileHash: 'file-hash-v2',
    templateVersion: 1,
    periodType: 'WEEK',
    periodStart: '2026-07-20',
    periodEnd: '2026-07-26',
    rows: rows.map((row) => ({
      rowNumber: row.rowNumber,
      rawValues: row.rawValues,
      normalizedValues: row.normalizedValues,
      status: row.status,
      errors: row.errors,
      resolvedEmployeeId: row.resolvedEmployeeId,
      resolvedProjectId: row.resolvedProjectId,
      resolvedTaskId: row.resolvedTaskId,
      keepUnlinked: row.keepUnlinked,
    })),
  });
}

function batch(rows: ReturnType<typeof stagedRow>[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-v2',
    periodType: 'WEEK',
    periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
    periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
    version: null,
    status: EmployeeWorkImportStatus.READY,
    snapshotStatus: EmployeeSnapshotStatus.NOT_STARTED,
    snapshotError: null,
    originalName: 'weekly-v2.xlsx',
    fileHash: 'file-hash-v2',
    sourceStorageKey: 'employee-imports/batch-v2/source.xlsx',
    errorStorageKey: null,
    templateVersion: 1,
    previewFingerprint: fingerprint(rows),
    totalRows: rows.length,
    validRows: rows.length,
    errorRows: 0,
    unresolvedRows: 0,
    importedRows: 0,
    supersedesBatchId: null,
    restoredFromBatchId: null,
    committedAt: null,
    expiresAt: new Date('2026-07-25T00:00:00.000Z'),
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createService(options: {
  rows?: ReturnType<typeof stagedRow>[];
  batchOverrides?: Record<string, unknown>;
  current?: { id: string; version: number } | null;
  claimCount?: number;
  validatorResult?: unknown[];
  workItemFailure?: Error;
  lockedEmployeeIds?: string[];
  lockedProjectIds?: string[];
  lockedTasks?: Array<{ id: string; projectId: string }>;
  snapshotWarning?: { code: string };
}) {
  const rows = options.rows ?? [
    stagedRow(2),
    stagedRow(3, {
      normalizedValues: normalizedRow(3, {
        plannedHours: 3.5,
        taskCode: null,
      }),
      resolvedTaskId: null,
    }),
    stagedRow(4, {
      normalizedValues: normalizedRow(4, {
        plannedHours: 2,
        projectCode: null,
        taskCode: null,
      }),
      resolvedProjectId: null,
      resolvedTaskId: null,
    }),
  ];
  const target = batch(rows, options.batchOverrides);
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockImplementation(async (query) => {
      const sql = query.strings.join(' ');
      if (sql.includes('resource_profiles')) {
        return (options.lockedEmployeeIds ?? ['employee-1']).map((id) => ({ id }));
      }
      if (sql.includes('projects')) {
        return (options.lockedProjectIds ?? ['project-1']).map((id) => ({ id }));
      }
      if (sql.includes('tasks')) {
        return options.lockedTasks ?? [{ id: 'task-1', projectId: 'project-1' }];
      }
      return options.current === undefined
        ? [{ id: 'batch-v1', version: 1 }]
        : options.current
          ? [options.current]
          : [];
    }),
    employeeWorkImportBatch: {
      findUnique: jest.fn().mockResolvedValue(target),
      findFirst: jest.fn().mockResolvedValue(target),
      updateMany: jest.fn().mockImplementation(async ({ where }) => {
        if (where.status === EmployeeWorkImportStatus.READY) {
          return { count: options.claimCount ?? 1 };
        }
        return { count: 1 };
      }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...target, ...data })),
      aggregate: jest.fn().mockResolvedValue({ _max: { version: 1 } }),
    },
    employeeWorkImportRow: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
    employeeWorkItem: {
      createMany: options.workItemFailure
        ? jest.fn().mockRejectedValue(options.workItemFailure)
        : jest.fn().mockResolvedValue({ count: rows.length }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    resourceLoadEntry: {
      createMany: jest.fn().mockResolvedValue({ count: rows.length }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation((work) => work(tx)),
  };
  const validator = {
    validate: jest.fn().mockResolvedValue(
      options.validatorResult ??
        rows.map((row) => ({
          row: row.normalizedValues,
          status: EmployeeImportRowStatus.VALID,
          errors: [],
          resolvedEmployeeId: row.resolvedEmployeeId,
          resolvedProjectId: row.resolvedProjectId,
          resolvedTaskId: row.resolvedTaskId,
          keepUnlinked: row.keepUnlinked,
        })),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const snapshotResult = {
    batch: {
      ...target,
      status: EmployeeWorkImportStatus.COMPLETED,
      version: 2,
      snapshotStatus: options.snapshotWarning
        ? EmployeeSnapshotStatus.FAILED
        : EmployeeSnapshotStatus.READY,
    },
    warning: options.snapshotWarning,
  };
  const snapshots = {
    ensureBatch: jest.fn().mockResolvedValue(snapshotResult),
    rebuildBatch: jest.fn().mockResolvedValue(snapshotResult),
  };
  return {
    service: new EmployeeImportCommitService(
      prisma as never,
      validator as never,
      audit as never,
      () => NOW,
      snapshots as never,
    ),
    prisma,
    validator,
    audit,
    tx,
    rows,
    target,
    snapshots,
  };
}

describe('EmployeeImportCommitService', () => {
  it('replaces the current week atomically, creates deterministic work/load rows, and archives v1', async () => {
    const dependencies = createService({});

    const result = await dependencies.service.commit('batch-v2');

    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(2);
    const referenceLocks = dependencies.tx.$queryRaw.mock.calls
      .map(([query]) => query.strings.join(' '))
      .filter((sql) => /resource_profiles|FROM "app"\."projects"|FROM "app"\."tasks"/.test(sql));
    expect(referenceLocks).toHaveLength(3);
    expect(referenceLocks.map((sql) => sql.match(/resource_profiles|projects|tasks/)?.[0])).toEqual(
      ['resource_profiles', 'projects', 'tasks'],
    );
    expect(referenceLocks.every((sql) => sql.includes('FOR UPDATE'))).toBe(true);
    expect(dependencies.tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      dependencies.validator.validate.mock.invocationCallOrder[0],
    );
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'batch-v2', status: EmployeeWorkImportStatus.READY },
      data: { status: EmployeeWorkImportStatus.IMPORTING },
    });
    expect(dependencies.tx.employeeWorkItem.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          importBatchId: 'batch-v2',
          sourceRowId: 'source-row-2',
          plannedHours: expect.objectContaining({}),
        }),
      ]),
    });
    const loadData = dependencies.tx.resourceLoadEntry.createMany.mock.calls[0][0].data;
    expect(loadData.map(({ kind }: { kind: LoadEntryKind }) => kind)).toEqual([
      LoadEntryKind.TASK,
      LoadEntryKind.PROJECT,
      LoadEntryKind.OTHER,
    ]);
    expect(loadData).toEqual([
      expect.objectContaining({
        kind: LoadEntryKind.TASK,
        taskId: 'task-1',
        projectId: null,
      }),
      expect.objectContaining({
        kind: LoadEntryKind.PROJECT,
        taskId: null,
        projectId: 'project-1',
      }),
      expect.objectContaining({
        kind: LoadEntryKind.OTHER,
        taskId: null,
        projectId: null,
      }),
    ]);
    expect(dependencies.tx.resourceLoadEntry.updateMany).toHaveBeenCalledWith({
      where: { employeeWorkImportBatchId: 'batch-v1', archivedAt: null },
      data: { archivedAt: NOW },
    });
    expect(dependencies.tx.employeeWorkItem.updateMany).toHaveBeenCalledWith({
      where: { importBatchId: 'batch-v1', archivedAt: null },
      data: { archivedAt: NOW },
    });
    expect(dependencies.tx.employeeWorkImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-v1' },
      data: { status: EmployeeWorkImportStatus.SUPERSEDED },
    });
    expect(dependencies.tx.employeeWorkImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-v2' },
      data: expect.objectContaining({
        status: EmployeeWorkImportStatus.COMPLETED,
        version: 2,
        importedRows: 3,
        committedAt: NOW,
        supersedesBatchId: 'batch-v1',
        snapshotStatus: EmployeeSnapshotStatus.NOT_STARTED,
      }),
    });
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_COMMITTED' }),
      dependencies.tx,
    );
    expect(result).toMatchObject({
      id: 'batch-v2',
      status: EmployeeWorkImportStatus.COMPLETED,
      version: 2,
      snapshotStatus: EmployeeSnapshotStatus.READY,
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
    });
    expect(result).not.toHaveProperty('periodStartAt');
    expect(result).not.toHaveProperty('periodEndAt');
    expect(dependencies.snapshots.ensureBatch).toHaveBeenCalledWith('batch-v2');
  });

  it('records restore success only inside the normal commit transaction', async () => {
    const dependencies = createService({
      batchOverrides: { restoredFromBatchId: 'batch-v1' },
    });

    await dependencies.service.commit('batch-v2');

    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_IMPORT_RESTORED',
        entityType: 'employeeWorkImportBatch',
        entityId: 'batch-v2',
        outcome: 'SUCCEEDED',
        metadata: expect.objectContaining({
          restoredFromBatchId: 'batch-v1',
          version: 2,
          itemCount: dependencies.rows.length,
        }),
      }),
      dependencies.tx,
    );
    const restoredCall = dependencies.audit.record.mock.calls.find(
      ([event]) => event.action === 'EMPLOYEE_IMPORT_RESTORED',
    );
    expect(restoredCall?.[1]).toBe(dependencies.tx);
  });

  it('returns an already completed batch without claiming or writing rows', async () => {
    const dependencies = createService({
      batchOverrides: {
        status: EmployeeWorkImportStatus.COMPLETED,
        version: 1,
        snapshotStatus: EmployeeSnapshotStatus.READY,
      },
    });

    await expect(dependencies.service.commit('batch-v2')).resolves.toMatchObject({
      id: 'batch-v2',
      status: EmployeeWorkImportStatus.COMPLETED,
      version: 1,
    });
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkItem.createMany).not.toHaveBeenCalled();
    expect(dependencies.snapshots.ensureBatch).not.toHaveBeenCalled();
  });

  it('recovers snapshot generation when an idempotent completed retry is still NOT_STARTED', async () => {
    const dependencies = createService({
      batchOverrides: {
        status: EmployeeWorkImportStatus.COMPLETED,
        version: 1,
        snapshotStatus: EmployeeSnapshotStatus.NOT_STARTED,
      },
    });

    await expect(dependencies.service.commit('batch-v2')).resolves.toMatchObject({
      id: 'batch-v2',
      status: EmployeeWorkImportStatus.COMPLETED,
      snapshotStatus: EmployeeSnapshotStatus.READY,
    });
    expect(dependencies.snapshots.ensureBatch).toHaveBeenCalledWith('batch-v2');
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-READY batch without creating formal rows', async () => {
    const dependencies = createService({
      batchOverrides: { status: EmployeeWorkImportStatus.PREVIEWED },
    });

    await expect(dependencies.service.commit('batch-v2')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
      statusCode: 409,
    });
    expect(dependencies.tx.employeeWorkItem.createMany).not.toHaveBeenCalled();
  });

  it('rejects an expired READY batch before claiming it', async () => {
    const dependencies = createService({
      batchOverrides: { expiresAt: new Date('2026-07-23T00:00:00.000Z') },
    });

    await expect(dependencies.service.commit('batch-v2')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_EXPIRED',
      statusCode: 410,
    });
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkItem.createMany).not.toHaveBeenCalled();
  });

  it('rejects a lost READY claim and does not create formal rows', async () => {
    const dependencies = createService({ claimCount: 0 });

    await expect(dependencies.service.commit('batch-v2')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
      statusCode: 409,
    });
    expect(dependencies.tx.employeeWorkItem.createMany).not.toHaveBeenCalled();
  });

  it('rejects fingerprint drift, writes no formal rows, and marks the rolled-back batch FAILED', async () => {
    const dependencies = createService({
      batchOverrides: { previewFingerprint: 'stale-fingerprint' },
    });

    await expect(dependencies.service.commit('batch-v2')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED',
      statusCode: 422,
    });
    expect(dependencies.tx.employeeWorkItem.createMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'batch-v2',
        status: { in: [EmployeeWorkImportStatus.READY, EmployeeWorkImportStatus.IMPORTING] },
        updatedAt: NOW,
        previewFingerprint: 'stale-fingerprint',
        sourceStorageKey: 'employee-imports/batch-v2/source.xlsx',
      }),
      data: { status: EmployeeWorkImportStatus.FAILED },
    });
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_COMMIT_FAILED' }),
      dependencies.tx,
    );
  });

  it('rejects reference drift when revalidation no longer matches staged IDs', async () => {
    const dependencies = createService({
      validatorResult: [
        {
          row: normalizedRow(2),
          status: EmployeeImportRowStatus.UNRESOLVED,
          errors: [{ code: 'TASK_NOT_FOUND' }],
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: 'project-1',
          resolvedTaskId: null,
          keepUnlinked: false,
        },
      ],
    });

    await expect(dependencies.service.commit('batch-v2')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_RESOLUTION_INVALID',
      statusCode: 422,
    });
    expect(dependencies.tx.employeeWorkItem.createMany).not.toHaveBeenCalled();
  });

  it('rejects and marks FAILED when a staged reference cannot be locked as active', async () => {
    const dependencies = createService({ lockedTasks: [] });

    await expect(dependencies.service.commit('batch-v2')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_RESOLUTION_INVALID',
      statusCode: 422,
    });
    expect(dependencies.validator.validate).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkItem.createMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'batch-v2',
        status: { in: [EmployeeWorkImportStatus.READY, EmployeeWorkImportStatus.IMPORTING] },
        updatedAt: NOW,
        previewFingerprint: dependencies.target.previewFingerprint,
      }),
      data: { status: EmployeeWorkImportStatus.FAILED },
    });
  });

  it('rolls back a write failure, preserves the old current, and marks only the target FAILED', async () => {
    const dependencies = createService({
      workItemFailure: new Error('work insert failed'),
    });

    await expect(dependencies.service.commit('batch-v2')).rejects.toThrow('work insert failed');
    expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalledWith({
      where: { id: 'batch-v1' },
      data: { status: EmployeeWorkImportStatus.SUPERSEDED },
    });
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'batch-v2',
        status: { in: [EmployeeWorkImportStatus.READY, EmployeeWorkImportStatus.IMPORTING] },
        updatedAt: NOW,
        previewFingerprint: dependencies.target.previewFingerprint,
      }),
      data: { status: EmployeeWorkImportStatus.FAILED },
    });
  });

  it('does not mark a newer READY preview FAILED after the claimed revision rolls back', async () => {
    const rows = [stagedRow(2)];
    const claimedBatch = batch(rows, {
      previewFingerprint: 'commit-a-fingerprint',
      updatedAt: new Date('2026-07-24T07:00:00.000Z'),
    });
    let currentBatch = { ...claimedBatch };
    let currentRows = rows;
    let recoveryStarted!: () => void;
    let resumeRecovery!: () => void;
    const recoveryIsWaiting = new Promise<void>((resolve) => {
      recoveryStarted = resolve;
    });
    const recoveryBarrier = new Promise<void>((resolve) => {
      resumeRecovery = resolve;
    });
    let transactionNumber = 0;
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      employeeWorkImportBatch: {
        findUnique: jest.fn().mockImplementation(async () => currentBatch),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          if (where.status === EmployeeWorkImportStatus.READY) return { count: 1 };
          if (where.updatedAt && where.updatedAt.getTime() !== currentBatch.updatedAt.getTime()) {
            return { count: 0 };
          }
          if (
            where.previewFingerprint !== undefined &&
            where.previewFingerprint !== currentBatch.previewFingerprint
          ) {
            return { count: 0 };
          }
          currentBatch = { ...currentBatch, ...data };
          return { count: 1 };
        }),
      },
      employeeWorkImportRow: {
        findMany: jest.fn().mockImplementation(async () => currentRows),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (work) => {
        transactionNumber += 1;
        if (transactionNumber === 2) {
          recoveryStarted();
          await recoveryBarrier;
        }
        return work(tx);
      }),
    };
    const validator = { validate: jest.fn() };
    const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    const service = new EmployeeImportCommitService(
      prisma as never,
      validator as never,
      audit as never,
      () => NOW,
    );

    const commitA = service.commit('batch-v2');
    await recoveryIsWaiting;
    const previewBRows = [
      stagedRow(2, {
        normalizedValues: normalizedRow(2, { title: 'Preview B row' }),
      }),
    ];
    currentRows = previewBRows;
    currentBatch = {
      ...currentBatch,
      status: EmployeeWorkImportStatus.READY,
      previewFingerprint: fingerprint(previewBRows),
      updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    };
    resumeRecovery();

    await expect(commitA).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED',
      statusCode: 422,
    });
    expect(currentBatch).toMatchObject({
      status: EmployeeWorkImportStatus.READY,
      previewFingerprint: fingerprint(previewBRows),
      updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    });
    expect(currentRows).toBe(previewBRows);
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_COMMIT_FAILED' }),
      tx,
    );
  });

  it('returns a safe warning when post-commit snapshot generation fails', async () => {
    const dependencies = createService({
      snapshotWarning: { code: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED' },
    });

    await expect(dependencies.service.commit('batch-v2')).resolves.toMatchObject({
      id: 'batch-v2',
      status: EmployeeWorkImportStatus.COMPLETED,
      snapshotStatus: EmployeeSnapshotStatus.FAILED,
      warning: { code: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED' },
    });
    expect(dependencies.tx.employeeWorkItem.createMany).toHaveBeenCalled();
  });

  it('allows an explicit idempotent snapshot rebuild for a completed batch', async () => {
    const dependencies = createService({});

    await expect(dependencies.service.rebuildSnapshots('batch-v2')).resolves.toMatchObject({
      id: 'batch-v2',
      snapshotStatus: EmployeeSnapshotStatus.READY,
    });
    expect(dependencies.snapshots.rebuildBatch).toHaveBeenCalledWith('batch-v2');
  });
});
