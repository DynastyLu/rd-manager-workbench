import {
  EmployeeProgressPeriod,
  EmployeeProgressScope,
  EmployeeSnapshotStatus,
  EmployeeWorkImportBatch,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  Prisma,
} from '@prisma/client';
import { EmployeeProgressSnapshotService } from '../../../../src/modules/workbench/employees/application/employee-progress-snapshot.service';

const NOW = new Date('2026-07-24T08:00:00.000Z');

function workItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    employeeId: 'employee-1',
    projectId: 'project-1',
    status: EmployeeWorkStatus.IN_PROGRESS,
    completionRate: 50,
    plannedHours: new Prisma.Decimal('8.00'),
    actualHours: new Prisma.Decimal('4.00'),
    riskText: null,
    ...overrides,
  };
}

function createService(options: {
  batches?: Array<Record<string, unknown>>;
  items?: Array<ReturnType<typeof workItem>>;
  snapshotCreateFailure?: Error;
  targetBatchOverrides?: Record<string, unknown>;
  beforeTransaction?: (transactionNumber: number) => Promise<void>;
  currentBatchIds?: string[][];
}) {
  const batches = options.batches ?? [
    {
      id: 'batch-jun-29',
      periodStartAt: new Date('2026-06-29T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-05T00:00:00.000Z'),
    },
    {
      id: 'batch-jul-13',
      periodStartAt: new Date('2026-07-13T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-19T00:00:00.000Z'),
    },
    {
      id: 'batch-jul-20',
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
    },
  ];
  const items =
    options.items ??
    Array.from({ length: 8 }, (_, index) =>
      workItem(`work-${index + 1}`, {
        employeeId: index < 4 ? 'employee-1' : 'employee-2',
        projectId: index % 2 === 0 ? 'project-1' : null,
      }),
    );
  const createdSnapshots: Array<Record<string, unknown>> = [];
  let currentBatchLookup = 0;
  let targetBatch = {
    id: 'batch-jul-20',
    periodType: EmployeeProgressPeriod.WEEK,
    periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
    periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
    status: EmployeeWorkImportStatus.COMPLETED,
    version: 2,
    snapshotStatus: EmployeeSnapshotStatus.NOT_STARTED,
    snapshotError: null,
    archivedAt: null,
    updatedAt: new Date('2026-07-24T07:00:00.000Z'),
    ...options.targetBatchOverrides,
  } as unknown as EmployeeWorkImportBatch;
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    employeeWorkImportBatch: {
      findMany: jest.fn().mockImplementation(async ({ select }) => {
        if (select && Object.keys(select).length === 1 && select.id === true) {
          const ids = options.currentBatchIds?.[currentBatchLookup] ??
            options.currentBatchIds?.at(-1) ?? [targetBatch.id];
          currentBatchLookup += 1;
          return ids.map((id) => ({ id }));
        }
        return batches;
      }),
      findUnique: jest.fn().mockImplementation(async () => targetBatch),
      update: jest.fn().mockImplementation(async ({ data }) => {
        targetBatch = { ...targetBatch, ...data };
        return targetBatch;
      }),
      updateMany: jest.fn().mockImplementation(async ({ data }) => {
        targetBatch = { ...targetBatch, ...data };
        return { count: 1 };
      }),
    },
    employeeWorkItem: {
      findMany: jest.fn().mockResolvedValue(items),
    },
    employeeProgressSnapshot: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _max: { version: 1 } }),
      groupBy: jest.fn().mockImplementation(async ({ where }) => {
        const baseVersionKeys = new Set([
          'TEAM',
          'EMPLOYEE:employee-1',
          'EMPLOYEE:employee-2',
          'PROJECT:project-1',
        ]);
        return (where.scopeKey.in as string[]).map((scopeKey) => {
          const createdVersions = createdSnapshots
            .filter((snapshot) => snapshot.scopeKey === scopeKey)
            .map((snapshot) => snapshot.version as number);
          return {
            scopeKey,
            _max: {
              version: Math.max(baseVersionKeys.has(scopeKey) ? 1 : 0, ...createdVersions),
            },
          };
        });
      }),
      createMany: options.snapshotCreateFailure
        ? jest.fn().mockRejectedValue(options.snapshotCreateFailure)
        : jest.fn().mockImplementation(async ({ data }) => {
            const rows = Array.isArray(data) ? data : [data];
            createdSnapshots.push(...rows);
            return { count: rows.length };
          }),
      create: options.snapshotCreateFailure
        ? jest.fn().mockRejectedValue(options.snapshotCreateFailure)
        : jest.fn().mockImplementation(async ({ data }) => {
            const created = { id: `snapshot-${createdSnapshots.length + 1}`, ...data };
            createdSnapshots.push(created);
            return created;
          }),
    },
  };
  let transactionNumber = 0;
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (work) => {
      transactionNumber += 1;
      const batchBeforeTransaction = targetBatch;
      try {
        await options.beforeTransaction?.(transactionNumber);
        return await work(tx);
      } catch (error) {
        targetBatch = batchBeforeTransaction;
        throw error;
      }
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  return {
    service: new EmployeeProgressSnapshotService(prisma as never, audit as never, () => NOW),
    prisma,
    audit,
    tx,
    batches,
    items,
    createdSnapshots,
    get targetBatch() {
      return targetBatch;
    },
    setTargetBatch(value: typeof targetBatch) {
      targetBatch = value;
    },
  };
}

describe('EmployeeProgressSnapshotService', () => {
  it('uses null rather than a misleading zero percent when the denominator is empty', () => {
    const { service } = createService({});

    expect(service.metrics([])).toEqual({
      workItemCount: 0,
      completedCount: 0,
      completionRate: null,
      averageCompletionRate: null,
      plannedHours: 0,
      actualHours: 0,
      riskCount: 0,
      blockedCount: 0,
      projectCount: 0,
      unlinkedCount: 0,
      dataComplete: true,
      missingWeeks: [],
    });
  });

  it('reduces progress, hours, risks, projects, and unlinked work deterministically', () => {
    const { service } = createService({});

    expect(
      service.metrics([
        workItem('completed', {
          status: EmployeeWorkStatus.COMPLETED,
          completionRate: 100,
          plannedHours: new Prisma.Decimal('3.25'),
          actualHours: new Prisma.Decimal('4.50'),
        }),
        workItem('blocked', {
          projectId: null,
          status: EmployeeWorkStatus.BLOCKED,
          completionRate: null,
          plannedHours: null,
          actualHours: new Prisma.Decimal('1.25'),
          riskText: 'blocked dependency',
        }),
      ]),
    ).toMatchObject({
      workItemCount: 2,
      completedCount: 1,
      completionRate: 50,
      averageCompletionRate: 100,
      plannedHours: 3.25,
      actualHours: 5.75,
      riskCount: 1,
      blockedCount: 1,
      projectCount: 1,
      unlinkedCount: 1,
    });
  });

  it('builds July from current COMPLETED weeks, excludes SUPERSEDED history, and reports UTC gaps', async () => {
    const dependencies = createService({});

    const teamSnapshot = await dependencies.service.rebuildMonth(
      new Date('2026-07-26T00:00:00.000Z'),
    );

    expect(dependencies.tx.employeeWorkImportBatch.findMany).toHaveBeenCalledWith({
      where: {
        status: EmployeeWorkImportStatus.COMPLETED,
        periodType: EmployeeProgressPeriod.WEEK,
        archivedAt: null,
        periodEndAt: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-31T00:00:00.000Z'),
        },
      },
      orderBy: [{ periodStartAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        periodStartAt: true,
        periodEndAt: true,
      },
    });
    expect(teamSnapshot).toMatchObject({
      scopeType: EmployeeProgressScope.TEAM,
      scopeKey: 'TEAM',
      periodType: EmployeeProgressPeriod.MONTH,
      periodStartAt: new Date('2026-07-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-31T00:00:00.000Z'),
      metrics: expect.objectContaining({
        workItemCount: 8,
        missingWeeks: ['2026-07-06'],
        dataComplete: false,
      }),
      sourceBatchIds: ['batch-jun-29', 'batch-jul-13', 'batch-jul-20'],
    });
    expect(dependencies.createdSnapshots.map(({ scopeKey }) => scopeKey)).toEqual([
      'TEAM',
      'EMPLOYEE:employee-1',
      'EMPLOYEE:employee-2',
      'PROJECT:project-1',
    ]);
    expect(dependencies.tx.employeeProgressSnapshot.updateMany).toHaveBeenCalledWith({
      where: {
        periodType: EmployeeProgressPeriod.MONTH,
        periodStartAt: new Date('2026-07-01T00:00:00.000Z'),
        archivedAt: null,
      },
      data: { archivedAt: NOW },
    });
    expect(dependencies.createdSnapshots.every(({ version }) => version === 2)).toBe(true);
  });

  it('uses the month containing a cross-year week end and includes the prior-year Monday', async () => {
    const dependencies = createService({
      batches: [
        {
          id: 'batch-dec-29',
          periodStartAt: new Date('2025-12-29T00:00:00.000Z'),
          periodEndAt: new Date('2026-01-04T00:00:00.000Z'),
        },
      ],
      items: [],
    });

    const snapshot = await dependencies.service.rebuildMonth(new Date('2026-01-04T00:00:00.000Z'));

    expect(snapshot).toMatchObject({
      periodStartAt: new Date('2026-01-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-01-31T00:00:00.000Z'),
      metrics: expect.objectContaining({
        missingWeeks: ['2026-01-05', '2026-01-12', '2026-01-19'],
        dataComplete: false,
      }),
      sourceBatchIds: ['batch-dec-29'],
    });
  });

  it('rebuilds TEAM, EMPLOYEE, and PROJECT week scopes before the affected month and marks READY', async () => {
    const dependencies = createService({
      batches: [
        {
          id: 'batch-jul-20',
          periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
          periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
        },
      ],
      items: [
        workItem('highlight', { status: EmployeeWorkStatus.COMPLETED }),
        workItem('risk', {
          employeeId: 'employee-2',
          projectId: null,
          status: EmployeeWorkStatus.AT_RISK,
          riskText: 'delivery risk',
        }),
      ],
    });

    const result = await dependencies.service.rebuildBatch('batch-jul-20');

    expect(result.warning).toBeUndefined();
    expect(result.batch).toMatchObject({
      id: 'batch-jul-20',
      status: EmployeeWorkImportStatus.COMPLETED,
      snapshotStatus: EmployeeSnapshotStatus.READY,
      snapshotError: null,
    });
    expect(
      dependencies.tx.employeeWorkImportBatch.update.mock.calls.map(
        ([{ data }]) => data.snapshotStatus,
      ),
    ).toEqual([EmployeeSnapshotStatus.GENERATING, EmployeeSnapshotStatus.READY]);
    const weekly = dependencies.createdSnapshots.filter(
      ({ periodType }) => periodType === EmployeeProgressPeriod.WEEK,
    );
    expect(weekly.map(({ scopeKey }) => scopeKey)).toEqual([
      'TEAM',
      'EMPLOYEE:employee-1',
      'EMPLOYEE:employee-2',
      'PROJECT:project-1',
    ]);
    expect(weekly[0]).toMatchObject({
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      sourceBatchIds: ['batch-jul-20'],
      highlights: { workItemIds: ['highlight'] },
      risks: { workItemIds: ['risk'] },
    });
    expect(
      dependencies.createdSnapshots.some(
        ({ periodType }) => periodType === EmployeeProgressPeriod.MONTH,
      ),
    ).toBe(true);
  });

  it('marks snapshot generation FAILED with a safe warning without changing COMPLETED import state', async () => {
    const dependencies = createService({
      snapshotCreateFailure: new Error('database internals must not leak'),
    });

    const result = await dependencies.service.rebuildBatch('batch-jul-20');

    expect(result).toMatchObject({
      batch: {
        id: 'batch-jul-20',
        status: EmployeeWorkImportStatus.COMPLETED,
        snapshotStatus: EmployeeSnapshotStatus.FAILED,
        snapshotError: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED',
      },
      warning: { code: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED' },
    });
    expect(JSON.stringify(result)).not.toContain('database internals');
  });

  it('builds 50,000 items with many scopes using bounded grouped snapshot writes', async () => {
    const items = Array.from({ length: 50_000 }, (_, index) =>
      workItem(`work-${index}`, {
        employeeId: `employee-${index % 100}`,
        projectId: `project-${index % 100}`,
      }),
    );
    const dependencies = createService({
      batches: [
        {
          id: 'batch-jul-20',
          periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
          periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
        },
      ],
      items,
    });

    await dependencies.service.rebuildMonth(new Date('2026-07-26T00:00:00.000Z'));

    expect(dependencies.createdSnapshots).toHaveLength(201);
    expect(dependencies.tx.employeeProgressSnapshot.groupBy).toHaveBeenCalledTimes(1);
    expect(dependencies.tx.employeeProgressSnapshot.createMany).toHaveBeenCalledTimes(1);
    expect(dependencies.tx.employeeProgressSnapshot.createMany.mock.calls[0][0].data).toHaveLength(
      201,
    );
    expect(dependencies.tx.employeeProgressSnapshot.aggregate).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeProgressSnapshot.create).not.toHaveBeenCalled();
  });

  it('creates a new auditable version on retry while archiving the prior active snapshot', async () => {
    const dependencies = createService({});

    const first = await dependencies.service.rebuildMonth(new Date('2026-07-26T00:00:00.000Z'));
    const second = await dependencies.service.rebuildMonth(new Date('2026-07-26T00:00:00.000Z'));

    expect(first.version).toBe(2);
    expect(second.version).toBe(3);
    expect(dependencies.tx.employeeProgressSnapshot.updateMany).toHaveBeenCalledTimes(2);
    expect(dependencies.tx.employeeProgressSnapshot.createMany).toHaveBeenCalledTimes(2);
    expect(dependencies.audit.record).toHaveBeenCalledTimes(2);
    expect(dependencies.prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }),
    );
  });

  it('does not create another version when commit ensure sees an already READY batch', async () => {
    const dependencies = createService({
      targetBatchOverrides: { snapshotStatus: EmployeeSnapshotStatus.READY },
    });

    const result = await dependencies.service.ensureBatch('batch-jul-20');

    expect(result.batch.snapshotStatus).toBe(EmployeeSnapshotStatus.READY);
    expect(dependencies.tx.employeeProgressSnapshot.createMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalled();
  });

  it('retries a stale repeatable-read waiter and observes the winning READY batch', async () => {
    let dependencies!: ReturnType<typeof createService>;
    dependencies = createService({
      beforeTransaction: async (transactionNumber) => {
        if (transactionNumber === 1) {
          throw new Prisma.PrismaClientKnownRequestError('stale repeatable-read snapshot', {
            code: 'P2034',
            clientVersion: 'test',
          });
        }
        if (transactionNumber === 2) {
          dependencies.setTargetBatch({
            ...dependencies.targetBatch,
            snapshotStatus: EmployeeSnapshotStatus.READY,
            updatedAt: new Date('2026-07-24T08:00:00.000Z'),
          });
        }
      },
    });

    await expect(dependencies.service.ensureBatch('batch-jul-20')).resolves.toMatchObject({
      batch: { snapshotStatus: EmployeeSnapshotStatus.READY },
    });
    expect(dependencies.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(dependencies.tx.employeeProgressSnapshot.createMany).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).not.toHaveBeenCalled();
  });

  it('retries a stale standalone month rebuild after a snapshot version conflict', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate snapshot version', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const dependencies = createService({
      beforeTransaction: async (transactionNumber) => {
        if (transactionNumber === 1) throw conflict;
      },
    });

    await expect(
      dependencies.service.rebuildMonth(new Date('2026-07-26T00:00:00.000Z')),
    ).resolves.toMatchObject({
      scopeKey: 'TEAM',
      periodType: EmployeeProgressPeriod.MONTH,
    });
    expect(dependencies.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry a state-invalid snapshot rebuild', async () => {
    const dependencies = createService({
      targetBatchOverrides: { status: EmployeeWorkImportStatus.READY },
    });

    await expect(dependencies.service.rebuildBatch('batch-jul-20')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
      statusCode: 409,
    });
    expect(dependencies.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an archived COMPLETED batch before replacing snapshots', async () => {
    const dependencies = createService({
      targetBatchOverrides: { archivedAt: new Date('2026-07-24T07:30:00.000Z') },
    });

    await expect(dependencies.service.rebuildBatch('batch-jul-20')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
      statusCode: 409,
    });
    expect(dependencies.tx.employeeProgressSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a COMPLETED batch when another batch is current for the same period', async () => {
    const dependencies = createService({
      currentBatchIds: [['batch-jul-27']],
    });

    await expect(dependencies.service.rebuildBatch('batch-jul-20')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
      statusCode: 409,
    });
    expect(dependencies.tx.employeeProgressSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it('revalidates the current COMPLETED batch after acquiring period and month locks', async () => {
    const dependencies = createService({
      currentBatchIds: [['batch-jul-20'], ['batch-jul-27']],
    });

    await expect(dependencies.service.ensureBatch('batch-jul-20')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
      statusCode: 409,
    });
    expect(dependencies.tx.employeeProgressSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it('does not demote a concurrent winning READY revision during FAILED recovery', async () => {
    let recoveryStarted!: () => void;
    let resumeRecovery!: () => void;
    const recoveryIsWaiting = new Promise<void>((resolve) => {
      recoveryStarted = resolve;
    });
    const recoveryBarrier = new Promise<void>((resolve) => {
      resumeRecovery = resolve;
    });
    const dependencies = createService({
      snapshotCreateFailure: new Error('snapshot write failed'),
      beforeTransaction: async (transactionNumber) => {
        if (transactionNumber === 2) {
          recoveryStarted();
          await recoveryBarrier;
        }
      },
    });

    const rebuilding = dependencies.service.rebuildBatch('batch-jul-20');
    await recoveryIsWaiting;
    dependencies.setTargetBatch({
      ...dependencies.targetBatch,
      snapshotStatus: EmployeeSnapshotStatus.READY,
      updatedAt: new Date('2026-07-24T08:00:00.000Z'),
    });
    resumeRecovery();

    await expect(rebuilding).resolves.toMatchObject({
      batch: {
        id: 'batch-jul-20',
        status: EmployeeWorkImportStatus.COMPLETED,
        snapshotStatus: EmployeeSnapshotStatus.READY,
      },
      warning: { code: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED' },
    });
    expect(dependencies.tx.employeeWorkImportBatch.updateMany).not.toHaveBeenCalled();
    expect(dependencies.audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_PROGRESS_SNAPSHOT_REBUILD_FAILED' }),
      dependencies.tx,
    );
  });

  it('returns a warning without overwriting a batch superseded before FAILED recovery', async () => {
    let recoveryStarted!: () => void;
    let resumeRecovery!: () => void;
    const recoveryIsWaiting = new Promise<void>((resolve) => {
      recoveryStarted = resolve;
    });
    const recoveryBarrier = new Promise<void>((resolve) => {
      resumeRecovery = resolve;
    });
    const dependencies = createService({
      snapshotCreateFailure: new Error('snapshot write failed'),
      beforeTransaction: async (transactionNumber) => {
        if (transactionNumber === 2) {
          recoveryStarted();
          await recoveryBarrier;
        }
      },
    });

    const rebuilding = dependencies.service.rebuildBatch('batch-jul-20');
    await recoveryIsWaiting;
    dependencies.setTargetBatch({
      ...dependencies.targetBatch,
      status: EmployeeWorkImportStatus.SUPERSEDED,
      snapshotStatus: EmployeeSnapshotStatus.NOT_STARTED,
    });
    resumeRecovery();

    await expect(rebuilding).resolves.toMatchObject({
      batch: {
        id: 'batch-jul-20',
        status: EmployeeWorkImportStatus.SUPERSEDED,
      },
      warning: { code: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED' },
    });
    expect(dependencies.audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_PROGRESS_SNAPSHOT_REBUILD_FAILED' }),
      dependencies.tx,
    );
  });
});
