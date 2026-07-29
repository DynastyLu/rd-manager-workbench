import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  EmployeeImportRowStatus,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
} from '@prisma/client';
import { EmployeeImportsService } from '../../../../src/modules/workbench/employees/application/employee-imports.service';
import {
  canonicalJson,
  employeeImportFingerprint,
} from '../../../../src/modules/workbench/employees/application/employee-import-fingerprint';
import {
  EmployeeWorkbookInspectionResult,
  NormalizedEmployeeCurrentWorkRow,
  NormalizedEmployeeNextWeekPlanRow,
  NormalizedEmployeeWorkRow,
} from '../../../../src/modules/workbench/employees/domain/employee-work.types';

const NOW = new Date('2026-07-24T00:00:00.000Z');
const SOURCE = Buffer.from('xlsx');
const SOURCE_HASH = createHash('sha256').update(SOURCE).digest('hex');
const ATTEMPT_KEY_PATTERN =
  /^employee-imports\/batch-1\/errors\/[a-f0-9]{64}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.xlsx$/;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

function restorableStoredRow(rowNumber: number) {
  const normalized = normalizedRow({ rowNumber });
  return {
    id: `row-${rowNumber}`,
    batchId: 'batch-1',
    rowNumber,
    rawValues: normalized.rawValues,
    normalizedValues: normalized,
    status: EmployeeImportRowStatus.VALID,
    errors: [],
    resolvedEmployeeId: 'employee-1',
    resolvedProjectId: 'project-1',
    resolvedTaskId: 'task-1',
    keepUnlinked: false,
  };
}

function largeRestoreFingerprint(rowCount: number): string {
  const hash = createHash('sha256');
  hash.update(
    `{"fileHash":${canonicalJson(SOURCE_HASH)},"periodEnd":"2026-07-26","periodStart":"2026-07-20","periodType":"WEEK","rows":[`,
  );
  for (let offset = 0; offset < rowCount; offset += 1) {
    const stored = restorableStoredRow(offset + 2);
    hash.update(offset === 0 ? '' : ',');
    hash.update(
      canonicalJson({
        rowNumber: stored.rowNumber,
        rawValues: stored.rawValues,
        normalizedValues: stored.normalizedValues,
        status: stored.status,
        errors: stored.errors,
        resolvedEmployeeId: stored.resolvedEmployeeId,
        resolvedProjectId: stored.resolvedProjectId,
        resolvedTaskId: stored.resolvedTaskId,
        keepUnlinked: stored.keepUnlinked,
      }),
    );
  }
  hash.update('],"templateVersion":1}');
  return hash.digest('hex');
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
  commitService?: { commit: jest.Mock; rebuildSnapshots: jest.Mock };
}) {
  const foundBatch = options.foundBatch ?? batch();
  const foundRows = ((foundBatch as any)?.rows ?? []) as Array<{ rowNumber: number }>;
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    employeeWorkImportRow: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockImplementation(({ where = {}, take }: any = {}) => {
        const after = where.rowNumber?.gt;
        const rows =
          typeof after === 'number'
            ? foundRows.filter(({ rowNumber }) => rowNumber > after)
            : foundRows;
        return take ? rows.slice(0, take) : rows;
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    employeeWorkImportBatch: {
      findFirst: jest.fn().mockResolvedValue(options.existingBatch ?? null),
      findUnique: jest.fn().mockResolvedValue(foundBatch),
      create: jest.fn().mockImplementation(({ data }) => batch(data)),
      update: jest.fn().mockImplementation(({ data }) => batch(data)),
    },
    resourceProfile: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'employee-created', ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'employee-1', ...data })),
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
    resourceProfile: {
      findMany: jest.fn().mockResolvedValue([
        {
          displayName: '匿名员工',
          department: '研发部',
          workDirection: '平台工程',
        },
      ]),
    },
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
    template: jest.fn().mockResolvedValue(Buffer.from('v2-template')),
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
      options.commitService as never,
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

function normalizedV2Current(): NormalizedEmployeeCurrentWorkRow {
  return {
    ...normalizedRow({
      employeeName: '匿名员工',
      projectCode: null,
      taskCode: null,
      plannedHours: null,
      actualHours: null,
      riskText: '外部接口存在延期风险',
    }),
    sourceSection: 'CURRENT_WORK',
    sourceSheetName: '匿名员工',
    sourceRowNumber: 7,
    department: '研发部',
    workDirection: '平台工程',
    plannedCompletionAt: '2026-07-24',
  };
}

function normalizedV2Plan(): NormalizedEmployeeNextWeekPlanRow {
  return {
    sourceSection: 'NEXT_WEEK_PLAN',
    rowNumber: 3,
    sourceSheetName: '匿名员工',
    sourceRowNumber: 28,
    employeeName: '匿名员工',
    department: '研发部',
    workDirection: '平台工程',
    title: '完成发布',
    deliverableText: '上线 V2 导入',
    plannedCompletionAt: '2026-07-31',
    priority: 'HIGH',
    collaborationText: '测试团队',
    planText: '完成回归后发布',
    note: null,
    rawValues: { 下周重点工作: '完成发布' },
  };
}

describe('EmployeeImportsService', () => {
  it('builds the public V2 template from active employee profiles', async () => {
    const dependencies = createService({});

    await expect(dependencies.service.template('2026-07-20')).resolves.toEqual(
      Buffer.from('v2-template'),
    );

    expect(dependencies.prisma.resourceProfile.findMany).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        employmentStatus: 'ACTIVE',
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      select: {
        displayName: true,
        department: true,
        workDirection: true,
      },
    });
    expect(dependencies.workbook.template).toHaveBeenCalledWith({
      periodStart: '2026-07-20',
      employees: [
        {
          employeeName: '匿名员工',
          department: '研发部',
          workDirection: '平台工程',
        },
      ],
    });
  });

  it('stages V2 source coordinates, row kind, risk decision, and optional hours', async () => {
    const current = normalizedV2Current();
    const plan = normalizedV2Plan();
    const dependencies = createService({
      foundBatch: batch({ templateVersion: 2 }),
      inspection: {
        meta: {
          templateVersion: 2,
          periodType: 'WEEK',
          periodStart: '2026-07-20',
          periodEnd: '2026-07-26',
          nextPeriodStart: '2026-07-27',
          nextPeriodEnd: '2026-08-02',
          employeeSheetCount: 1,
        },
        rows: [current, plan],
        sourceRows: [
          {
            rowNumber: current.rowNumber,
            sourceSheetName: current.sourceSheetName,
            sourceSection: current.sourceSection,
            sourceRowNumber: current.sourceRowNumber,
            rawValues: current.rawValues,
          },
          {
            rowNumber: plan.rowNumber,
            sourceSheetName: plan.sourceSheetName,
            sourceSection: plan.sourceSection,
            sourceRowNumber: plan.sourceRowNumber,
            rawValues: plan.rawValues,
          },
        ],
        issues: [],
        profileWarnings: [],
      },
      validation: [
        {
          row: current,
          status: EmployeeImportRowStatus.UNRESOLVED,
          errors: [{ field: '工作类型', code: 'WORK_KIND_REQUIRED' }],
          warnings: [],
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: false,
          workKind: null,
          plannedHours: null,
          actualHours: null,
          profileAction: 'KEEP',
          riskDecision: 'KEEP',
          riskText: '外部接口存在延期风险',
        },
        {
          row: plan,
          status: EmployeeImportRowStatus.UNRESOLVED,
          errors: [{ field: '工作类型', code: 'WORK_KIND_REQUIRED' }],
          warnings: [],
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: false,
          workKind: null,
          plannedHours: null,
          actualHours: null,
          profileAction: 'KEEP',
          riskDecision: null,
          riskText: null,
        },
      ],
    });

    await dependencies.service.preview('batch-1');

    const data = dependencies.tx.employeeWorkImportRow.createMany.mock.calls[0][0].data;
    expect(data).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        sourceSheetName: '匿名员工',
        sourceSection: 'CURRENT_WORK',
        sourceRowNumber: 7,
        sourceKey: '匿名员工:CURRENT_WORK:7',
        workKind: null,
        plannedHours: null,
        actualHours: null,
        profileAction: 'KEEP',
        riskDecision: 'KEEP',
        riskText: '外部接口存在延期风险',
      }),
      expect.objectContaining({
        rowNumber: 3,
        sourceSheetName: '匿名员工',
        sourceSection: 'NEXT_WEEK_PLAN',
        sourceRowNumber: 28,
        sourceKey: '匿名员工:NEXT_WEEK_PLAN:28',
        workKind: null,
        actualHours: null,
        riskDecision: null,
      }),
    ]);
  });

  it('resolves a V2 row by rowId and persists every administrator confirmation', async () => {
    const current = normalizedV2Current();
    const staged = {
      id: 'row-v2-current',
      batchId: 'batch-1',
      rowNumber: 2,
      sourceSheetName: '匿名员工',
      sourceSection: 'CURRENT_WORK',
      sourceRowNumber: 7,
      sourceKey: '匿名员工:CURRENT_WORK:7',
      rawValues: current.rawValues,
      normalizedValues: current,
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [{ field: '工作类型', code: 'WORK_KIND_REQUIRED' }],
      resolvedEmployeeId: null,
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
      workKind: null,
      plannedHours: null,
      actualHours: null,
      profileAction: 'KEEP',
      riskDecision: 'KEEP',
      riskText: '外部接口存在延期风险',
    };
    const dependencies = createService({
      foundBatch: batch({
        templateVersion: 2,
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
      }),
      validation: [
        {
          row: current,
          status: EmployeeImportRowStatus.VALID,
          errors: [],
          warnings: [],
          resolvedEmployeeId: 'employee-created',
          resolvedProjectId: 'project-1',
          resolvedTaskId: 'task-1',
          keepUnlinked: false,
          workKind: 'PROJECT',
          plannedHours: 8,
          actualHours: 7.5,
          profileAction: 'CREATE',
          riskDecision: 'EDIT',
          riskText: '已调整的风险说明',
        },
      ],
    });
    dependencies.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await dependencies.service.resolve('batch-1', {
      rows: [
        {
          rowId: 'row-v2-current',
          createEmployee: {
            displayName: '匿名员工',
            department: '研发部',
            workDirection: '平台工程',
          },
          workKind: 'PROJECT',
          projectId: 'project-1',
          taskId: 'task-1',
          plannedHours: 8,
          actualHours: 7.5,
          riskDecision: 'EDIT',
          riskText: '已调整的风险说明',
        },
      ],
    });

    expect(dependencies.tx.resourceProfile.create).toHaveBeenCalledWith({
      data: {
        displayName: '匿名员工',
        department: '研发部',
        workDirection: '平台工程',
      },
      select: { id: true },
    });
    expect(dependencies.validator.validate).toHaveBeenCalledWith(
      [current],
      new Map([
        [
          2,
          expect.objectContaining({
            employeeId: 'employee-created',
            workKind: 'PROJECT',
            projectId: 'project-1',
            taskId: 'task-1',
            plannedHours: 8,
            actualHours: 7.5,
            profileAction: 'CREATE',
            riskDecision: 'EDIT',
            riskText: '已调整的风险说明',
          }),
        ],
      ]),
      dependencies.tx,
    );
    const updateSql = dependencies.tx.$executeRaw.mock.calls[1][0].strings.join(' ');
    expect(updateSql).toContain('"work_kind"');
    expect(updateSql).toContain('"planned_hours"');
    expect(updateSql).toContain('"risk_decision"');
  });

  it('creates one employee profile for repeated V2 rows with the same normalized name', async () => {
    const current = normalizedV2Current();
    const plan = normalizedV2Plan();
    const stagedRows = [
      {
        ...restorableStoredRow(2),
        id: 'row-v2-current',
        normalizedValues: current,
        sourceSheetName: current.sourceSheetName,
        sourceSection: current.sourceSection,
        sourceRowNumber: current.sourceRowNumber,
        sourceKey: `${current.sourceSheetName}:${current.sourceSection}:${current.sourceRowNumber}`,
        resolvedEmployeeId: null,
        workKind: null,
        plannedHours: null,
        actualHours: null,
        profileAction: 'KEEP',
        riskDecision: 'KEEP',
        riskText: current.riskText,
      },
      {
        ...restorableStoredRow(3),
        id: 'row-v2-plan',
        normalizedValues: plan,
        sourceSheetName: plan.sourceSheetName,
        sourceSection: plan.sourceSection,
        sourceRowNumber: plan.sourceRowNumber,
        sourceKey: `${plan.sourceSheetName}:${plan.sourceSection}:${plan.sourceRowNumber}`,
        resolvedEmployeeId: null,
        workKind: null,
        plannedHours: null,
        actualHours: null,
        profileAction: 'KEEP',
        riskDecision: null,
        riskText: null,
      },
    ];
    const validRow = (
      row: NormalizedEmployeeCurrentWorkRow | NormalizedEmployeeNextWeekPlanRow,
    ) => ({
      row,
      status: EmployeeImportRowStatus.VALID,
      errors: [],
      warnings: [],
      resolvedEmployeeId: 'employee-created',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: false,
      workKind: 'NON_PROJECT',
      plannedHours: null,
      actualHours: null,
      profileAction: 'CREATE',
      riskDecision: row.sourceSection === 'CURRENT_WORK' ? 'KEEP' : null,
      riskText: row.sourceSection === 'CURRENT_WORK' ? row.riskText : null,
    });
    const dependencies = createService({
      foundBatch: batch({
        templateVersion: 2,
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: stagedRows,
        totalRows: 2,
        previewFingerprint: 'preview-fingerprint',
      }),
      validation: [validRow(current), validRow(plan)],
    });
    dependencies.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await dependencies.service.resolve('batch-1', {
      rows: stagedRows.map((row, index) => ({
        rowId: row.id,
        ...(index === 0
          ? {
              createEmployee: {
                displayName: '匿名员工',
                department: '研发部',
                workDirection: '平台工程',
              },
            }
          : {}),
        workKind: 'NON_PROJECT',
        projectId: null,
        taskId: null,
        riskDecision: row.sourceSection === 'CURRENT_WORK' ? 'KEEP' : undefined,
      })),
    });

    expect(dependencies.tx.resourceProfile.create).toHaveBeenCalledTimes(1);
    const resolutions = dependencies.validator.validate.mock.calls[0][1] as Map<
      number,
      { employeeId?: string }
    >;
    expect(resolutions.get(2)?.employeeId).toBe('employee-created');
    expect(resolutions.get(3)?.employeeId).toBe('employee-created');
  });

  it('reuses one exact active employee match instead of creating a duplicate profile', async () => {
    const current = normalizedV2Current();
    const staged = {
      ...restorableStoredRow(2),
      id: 'row-v2-current',
      normalizedValues: current,
      sourceSheetName: current.sourceSheetName,
      sourceSection: current.sourceSection,
      sourceRowNumber: current.sourceRowNumber,
      sourceKey: `${current.sourceSheetName}:${current.sourceSection}:${current.sourceRowNumber}`,
      resolvedEmployeeId: null,
      workKind: null,
      plannedHours: null,
      actualHours: null,
      profileAction: 'KEEP',
      riskDecision: 'KEEP',
      riskText: current.riskText,
    };
    const dependencies = createService({
      foundBatch: batch({
        templateVersion: 2,
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
      }),
      validation: [
        {
          row: current,
          status: EmployeeImportRowStatus.VALID,
          errors: [],
          warnings: [],
          resolvedEmployeeId: 'employee-existing',
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: false,
          workKind: 'NON_PROJECT',
          plannedHours: null,
          actualHours: null,
          profileAction: 'CREATE',
          riskDecision: 'KEEP',
          riskText: current.riskText,
        },
      ],
    });
    dependencies.tx.resourceProfile.findMany.mockResolvedValue([
      { id: 'employee-existing', displayName: '匿名员工' },
    ]);
    dependencies.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await dependencies.service.resolve('batch-1', {
      rows: [
        {
          rowId: staged.id,
          createEmployee: {
            displayName: '匿名员工',
            department: '研发部',
            workDirection: '平台工程',
          },
          workKind: 'NON_PROJECT',
          riskDecision: 'KEEP',
        },
      ],
    });

    expect(dependencies.tx.resourceProfile.create).not.toHaveBeenCalled();
    const resolutions = dependencies.validator.validate.mock.calls[0][1] as Map<
      number,
      { employeeId?: string }
    >;
    expect(resolutions.get(2)?.employeeId).toBe('employee-existing');
  });

  it('rejects employee creation when an exact name matches multiple active profiles', async () => {
    const current = normalizedV2Current();
    const staged = {
      ...restorableStoredRow(2),
      id: 'row-v2-current',
      normalizedValues: current,
      sourceSheetName: current.sourceSheetName,
      sourceSection: current.sourceSection,
      sourceRowNumber: current.sourceRowNumber,
      sourceKey: `${current.sourceSheetName}:${current.sourceSection}:${current.sourceRowNumber}`,
      resolvedEmployeeId: null,
      workKind: null,
      plannedHours: null,
      actualHours: null,
      profileAction: 'KEEP',
      riskDecision: 'KEEP',
      riskText: current.riskText,
    };
    const dependencies = createService({
      foundBatch: batch({
        templateVersion: 2,
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [staged],
        totalRows: 1,
        previewFingerprint: 'preview-fingerprint',
      }),
    });
    dependencies.tx.resourceProfile.findMany.mockResolvedValue([
      { id: 'employee-a', displayName: '匿名员工' },
      { id: 'employee-b', displayName: '匿名员工' },
    ]);

    await expect(
      dependencies.service.resolve('batch-1', {
        rows: [
          {
            rowId: staged.id,
            createEmployee: {
              displayName: '匿名员工',
              department: '研发部',
              workDirection: '平台工程',
            },
            workKind: 'NON_PROJECT',
            riskDecision: 'KEEP',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_IMPORT_RESOLUTION_INVALID' });

    expect(dependencies.tx.resourceProfile.create).not.toHaveBeenCalled();
    expect(dependencies.validator.validate).not.toHaveBeenCalled();
  });

  it('reuses an employee already resolved by another row in the same import batch', async () => {
    const current = normalizedV2Current();
    const plan = normalizedV2Plan();
    const resolvedRow = {
      ...restorableStoredRow(2),
      id: 'row-v2-current',
      normalizedValues: current,
      sourceSheetName: current.sourceSheetName,
      sourceSection: current.sourceSection,
      sourceRowNumber: current.sourceRowNumber,
      sourceKey: `${current.sourceSheetName}:${current.sourceSection}:${current.sourceRowNumber}`,
      resolvedEmployeeId: 'employee-from-previous-resolution',
      workKind: 'NON_PROJECT',
      plannedHours: null,
      actualHours: null,
      profileAction: 'CREATE',
      riskDecision: 'KEEP',
      riskText: current.riskText,
    };
    const unresolvedRow = {
      ...restorableStoredRow(3),
      id: 'row-v2-plan',
      normalizedValues: plan,
      sourceSheetName: plan.sourceSheetName,
      sourceSection: plan.sourceSection,
      sourceRowNumber: plan.sourceRowNumber,
      sourceKey: `${plan.sourceSheetName}:${plan.sourceSection}:${plan.sourceRowNumber}`,
      resolvedEmployeeId: null,
      workKind: null,
      plannedHours: null,
      actualHours: null,
      profileAction: 'KEEP',
      riskDecision: null,
      riskText: null,
    };
    const dependencies = createService({
      foundBatch: batch({
        templateVersion: 2,
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: [resolvedRow, unresolvedRow],
        totalRows: 2,
        previewFingerprint: 'preview-fingerprint',
      }),
      validation: [
        {
          row: plan,
          status: EmployeeImportRowStatus.VALID,
          errors: [],
          warnings: [],
          resolvedEmployeeId: 'employee-from-previous-resolution',
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: false,
          workKind: 'NON_PROJECT',
          plannedHours: null,
          actualHours: null,
          profileAction: 'KEEP',
          riskDecision: null,
          riskText: null,
        },
      ],
    });
    dependencies.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await dependencies.service.resolve('batch-1', {
      rows: [
        {
          rowId: unresolvedRow.id,
          createEmployee: {
            displayName: '匿名员工',
            department: '研发部',
            workDirection: '平台工程',
          },
          workKind: 'NON_PROJECT',
        },
      ],
    });

    expect(dependencies.tx.resourceProfile.create).not.toHaveBeenCalled();
    const resolutions = dependencies.validator.validate.mock.calls[0][1] as Map<
      number,
      { employeeId?: string }
    >;
    expect(resolutions.get(3)?.employeeId).toBe('employee-from-previous-resolution');
  });

  it('rejects conflicting rowId and rowNumber coordinates', async () => {
    const current = normalizedV2Current();
    const stagedRows = [
      {
        ...restorableStoredRow(2),
        id: 'row-a',
        normalizedValues: current,
        sourceSheetName: '匿名员工',
        sourceSection: 'CURRENT_WORK',
        sourceRowNumber: 7,
        sourceKey: '匿名员工:CURRENT_WORK:7',
        workKind: null,
        plannedHours: null,
        actualHours: null,
        profileAction: 'KEEP',
        riskDecision: 'KEEP',
        riskText: current.riskText,
      },
      { ...restorableStoredRow(3), id: 'row-b' },
    ];
    const dependencies = createService({
      foundBatch: batch({
        templateVersion: 2,
        status: EmployeeWorkImportStatus.RESOLVING,
        rows: stagedRows,
        totalRows: 2,
        previewFingerprint: 'preview-fingerprint',
      }),
    });

    await expect(
      dependencies.service.resolve('batch-1', {
        rows: [{ rowId: 'row-a', rowNumber: 3, workKind: 'NON_PROJECT' }],
      }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_IMPORT_RESOLUTION_INVALID' });
    expect(dependencies.validator.validate).not.toHaveBeenCalled();
  });

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
    expect(result).toMatchObject({
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
    });
    expect(result).not.toHaveProperty('periodStartAt');
    expect(result).not.toHaveProperty('periodEndAt');
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

  it('keeps an uploaded source when an ambiguous commit already references it', async () => {
    const dependencies = createService({});
    let transactionCall = 0;
    dependencies.prisma.$transaction.mockImplementation(async (work) => {
      transactionCall += 1;
      if (transactionCall === 1) {
        await work(dependencies.tx);
        const created = dependencies.tx.employeeWorkImportBatch.create.mock.calls[0][0].data;
        dependencies.tx.employeeWorkImportBatch.findUnique.mockResolvedValue(
          batch({
            id: created.id,
            sourceStorageKey: created.sourceStorageKey,
          }),
        );
        throw new Error('upload commit result ambiguous');
      }
      return work(dependencies.tx);
    });

    await expect(
      dependencies.service.upload({
        originalname: 'weekly.xlsx',
        mimetype: 'application/octet-stream',
        size: SOURCE.length,
        buffer: SOURCE,
      }),
    ).rejects.toThrow('upload commit result ambiguous');

    const sourceKey =
      dependencies.tx.employeeWorkImportBatch.create.mock.calls[0][0].data.sourceStorageKey;
    expect(dependencies.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.delete).not.toHaveBeenCalledWith(sourceKey);
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

  it('uses a unified 30s max-wait and 120s transaction timeout', async () => {
    const dependencies = createService({});

    await dependencies.service.upload({
      originalname: 'weekly.xlsx',
      mimetype: 'application/octet-stream',
      size: SOURCE.length,
      buffer: SOURCE,
    });

    expect(dependencies.prisma.$transaction.mock.calls[0][1]).toEqual({
      maxWait: 30_000,
      timeout: 120_000,
    });
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
        errorStorageKey: expect.stringMatching(ATTEMPT_KEY_PATTERN),
      }),
    });
    expect(dependencies.storage.write).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(ATTEMPT_KEY_PATTERN),
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

  it('precomputes preview file work before taking the batch advisory lock', async () => {
    const dependencies = createService({
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

    await dependencies.service.preview('batch-1');

    const lockOrder = dependencies.tx.$executeRaw.mock.invocationCallOrder[0];
    expect(dependencies.storage.read.mock.invocationCallOrder[0]).toBeLessThan(lockOrder);
    expect(dependencies.workbook.inspect.mock.invocationCallOrder[0]).toBeLessThan(lockOrder);
    expect(dependencies.validator.validate.mock.invocationCallOrder[0]).toBeLessThan(lockOrder);
    expect(dependencies.storage.write.mock.invocationCallOrder[0]).toBeLessThan(lockOrder);
  });

  it.each([
    ['status', { status: EmployeeWorkImportStatus.RESOLVING }],
    ['updatedAt', { updatedAt: new Date(NOW.getTime() + 1) }],
    ['preview fingerprint', { previewFingerprint: 'new-preview-fingerprint' }],
  ])(
    'rejects a slow preview when the snapshot %s changed before it acquired the lock',
    async (_field, changed) => {
      const snapshot = batch({
        status: EmployeeWorkImportStatus.PREVIEWED,
        previewFingerprint: null,
      });
      const inspectionBarrier = deferred<EmployeeWorkbookInspectionResult>();
      const dependencies = createService({ foundBatch: snapshot });
      dependencies.workbook.inspect.mockReturnValue(inspectionBarrier.promise);
      let current = snapshot;
      dependencies.tx.employeeWorkImportBatch.findUnique.mockImplementation(async () => current);

      const slowPreview = dependencies.service.preview('batch-1');
      await new Promise<void>((resolve) => {
        const poll = () =>
          dependencies.workbook.inspect.mock.calls.length > 0 ? resolve() : setImmediate(poll);
        poll();
      });
      current = batch({
        ...snapshot,
        ...changed,
        errorStorageKey: 'employee-imports/batch-1/errors/peer.xlsx',
      });
      inspectionBarrier.resolve({
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
      });

      await expect(slowPreview).rejects.toMatchObject({
        code: 'EMPLOYEE_IMPORT_STATE_STALE',
        statusCode: 409,
      });
      const attemptKey = dependencies.storage.write.mock.calls[0][0].key as string;
      expect(dependencies.tx.employeeWorkImportRow.deleteMany).not.toHaveBeenCalled();
      expect(dependencies.tx.employeeWorkImportRow.createMany).not.toHaveBeenCalled();
      expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalled();
      expect(dependencies.storage.delete).toHaveBeenCalledWith(attemptKey);
      expect(dependencies.storage.delete).not.toHaveBeenCalledWith(
        'employee-imports/batch-1/errors/peer.xlsx',
      );
    },
  );

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
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_IMPORT_PREVIEW_FAILED',
        outcome: 'FAILED',
      }),
    );
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
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_IMPORT_PREVIEW_FAILED',
        outcome: 'FAILED',
      }),
    );
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
    expect(newKey).toMatch(ATTEMPT_KEY_PATTERN);
    expect(newKey).not.toBe(oldKey);
    expect(dependencies.storage.delete).toHaveBeenCalledWith(newKey);
    expect(dependencies.storage.delete).not.toHaveBeenCalledWith(oldKey);
  });

  it('warns when guarded attempt artifact cleanup cannot delete storage', async () => {
    const dependencies = createService({
      auditFailure: new Error('audit failed'),
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
    dependencies.storage.delete.mockRejectedValueOnce(new Error('storage unavailable'));
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      await expect(dependencies.service.preview('batch-1')).rejects.toThrow('audit failed');
      const attemptKey = dependencies.storage.write.mock.calls[0][0].key as string;
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining(`attempt artifact ${attemptKey}`),
      );
    } finally {
      warning.mockRestore();
    }
  });

  it('uses unique attempt keys so a rolled-back preview cannot delete a successful peer artifact', async () => {
    const auditBarrier = deferred();
    const invalidInspection = {
      ...inspection(),
      rows: [],
      sourceRows: [{ rowNumber: 2, rawValues: { 员工姓名: null } }],
      issues: [
        {
          code: 'REQUIRED_FIELD' as const,
          rowNumber: 2,
          field: '员工姓名',
          rawValue: null,
          reason: 'required',
        },
      ],
    };
    const first = createService({ inspection: invalidInspection, validation: [] });
    const second = createService({ inspection: invalidInspection, validation: [] });
    first.audit.record.mockImplementationOnce(() => auditBarrier.promise);
    second.storage.write = first.storage.write;
    second.storage.delete = first.storage.delete;

    const rolledBack = first.service.preview('batch-1');
    await new Promise<void>((resolve) => {
      const poll = () =>
        first.audit.record.mock.calls.length > 0 ? resolve() : setImmediate(poll);
      poll();
    });
    await second.service.preview('batch-1');
    const firstKey = first.storage.write.mock.calls[0][0].key as string;
    const secondKey = first.storage.write.mock.calls[1][0].key as string;
    auditBarrier.reject(new Error('first preview rolled back'));
    await expect(rolledBack).rejects.toThrow('first preview rolled back');

    expect(firstKey).not.toBe(secondKey);
    expect(first.storage.delete).toHaveBeenCalledWith(firstKey);
    expect(first.storage.delete).not.toHaveBeenCalledWith(secondKey);
  });

  it('keeps an attempt artifact when an ambiguous commit is already referenced by the batch', async () => {
    const dependencies = createService({
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
    let transactionCall = 0;
    dependencies.prisma.$transaction.mockImplementation(async (work) => {
      transactionCall += 1;
      if (transactionCall === 1) {
        await work(dependencies.tx);
        const attemptKey =
          dependencies.tx.employeeWorkImportBatch.update.mock.calls[0][0].data.errorStorageKey;
        dependencies.tx.employeeWorkImportBatch.findUnique.mockResolvedValue(
          batch({ errorStorageKey: attemptKey }),
        );
        throw new Error('commit result ambiguous');
      }
      return work(dependencies.tx);
    });

    await expect(dependencies.service.preview('batch-1')).rejects.toThrow(
      'commit result ambiguous',
    );

    const attemptKey = dependencies.storage.write.mock.calls[0][0].key as string;
    expect(dependencies.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.delete).not.toHaveBeenCalledWith(attemptKey);
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

  it('keeps a successful preview and traces best-effort old artifact deletion failure', async () => {
    const oldKey = 'employee-imports/batch-1/errors/old.xlsx';
    const dependencies = createService({
      foundBatch: batch({ errorStorageKey: oldKey }),
    });
    dependencies.storage.delete.mockRejectedValueOnce(new Error('storage unavailable'));
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      await expect(dependencies.service.preview('batch-1')).resolves.toMatchObject({
        status: EmployeeWorkImportStatus.READY,
      });
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining(`old preview artifact ${oldKey}`),
      );
    } finally {
      warning.mockRestore();
    }
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
    expect(newKey).toMatch(ATTEMPT_KEY_PATTERN);
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
    dependencies.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(205);

    await dependencies.service.resolve('batch-1', {
      rows: stagedRows.map(({ rowNumber }) => ({ rowNumber, keepUnlinked: true })),
    });

    expect(dependencies.tx.employeeWorkImportRow.update).not.toHaveBeenCalled();
    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('updates exactly 50,000 validated rows with 50 bulk statements of 1,000 rows', async () => {
    const rowCount = 50_000;
    const stagedRows = Array.from({ length: rowCount }, (_, index) => {
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
        totalRows: rowCount,
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
    dependencies.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValue(1_000);

    await dependencies.service.resolve('batch-1', {
      rows: stagedRows.map(({ rowNumber }) => ({ rowNumber, keepUnlinked: true })),
    });

    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(51);
    expect(dependencies.tx.employeeWorkImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: expect.objectContaining({
        status: EmployeeWorkImportStatus.READY,
        validRows: rowCount,
        unresolvedRows: 0,
      }),
    });
  }, 30_000);

  it('rolls back with a typed integrity error when a bulk update partially matches', async () => {
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
    dependencies.tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(
      dependencies.service.resolve('batch-1', {
        rows: [{ rowNumber: 2, keepUnlinked: true }],
      }),
    ).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_INTEGRITY_FAILED',
      statusCode: 422,
    });
    expect(dependencies.tx.employeeWorkImportBatch.update).not.toHaveBeenCalled();
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_IMPORT_RESOLUTION_FAILED',
        outcome: 'FAILED',
      }),
    );
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
      },
    });
    expect(draft.tx.$executeRaw).toHaveBeenCalledTimes(2);
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

  it('retries file cleanup idempotently for an already EXPIRED batch', async () => {
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.EXPIRED,
        archivedAt: NOW,
        errorStorageKey: 'employee-imports/batch-1/errors/current.xlsx',
      }),
    });

    await dependencies.service.remove('batch-1');

    expect(dependencies.storage.delete).toHaveBeenCalledWith(
      'employee-imports/batch-1/source.xlsx',
    );
    expect(dependencies.storage.delete).toHaveBeenCalledWith(
      'employee-imports/batch-1/errors/current.xlsx',
    );
    expect(dependencies.audit.record).not.toHaveBeenCalled();
  });

  it('keeps cleanup locators and returns typed 503 when file deletion fails', async () => {
    const dependencies = createService({
      foundBatch: batch({
        status: EmployeeWorkImportStatus.READY,
        errorStorageKey: 'employee-imports/batch-1/errors/current.xlsx',
      }),
    });
    dependencies.storage.delete.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(dependencies.service.remove('batch-1')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_CLEANUP_FAILED',
      statusCode: 503,
    });

    expect(dependencies.tx.employeeWorkImportBatch.update.mock.calls[0][0].data).toEqual({
      status: EmployeeWorkImportStatus.EXPIRED,
      archivedAt: NOW,
    });
    expect(dependencies.tx.employeeWorkImportBatch.update).toHaveBeenCalledTimes(1);
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

  it('downloads the immutable source workbook without exposing its storage key', async () => {
    const dependencies = createService({
      foundBatch: batch({ status: EmployeeWorkImportStatus.SUPERSEDED }),
    });

    const result = await dependencies.service.sourceFile('batch-1');

    expect(dependencies.storage.read).toHaveBeenCalledWith('employee-imports/batch-1/source.xlsx');
    expect(result).toEqual({
      fileName: 'weekly.xlsx',
      content: SOURCE,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sourceBatchIds: ['batch-1'],
    });
  });

  it('copies a completed source and resolved rows to a private READY batch before normal commit', async () => {
    const staged = {
      id: 'row-1',
      batchId: 'batch-1',
      rowNumber: 2,
      rawValues: normalizedRow().rawValues,
      normalizedValues: normalizedRow(),
      status: EmployeeImportRowStatus.VALID,
      errors: [],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: 'project-1',
      resolvedTaskId: 'task-1',
      keepUnlinked: false,
    };
    const previewFingerprint = employeeImportFingerprint({
      fileHash: SOURCE_HASH,
      templateVersion: 1,
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      rows: [
        {
          rowNumber: staged.rowNumber,
          rawValues: staged.rawValues,
          normalizedValues: staged.normalizedValues,
          status: staged.status,
          errors: staged.errors,
          resolvedEmployeeId: staged.resolvedEmployeeId,
          resolvedProjectId: staged.resolvedProjectId,
          resolvedTaskId: staged.resolvedTaskId,
          keepUnlinked: staged.keepUnlinked,
        },
      ],
    });
    const source = batch({
      version: 1,
      status: EmployeeWorkImportStatus.SUPERSEDED,
      previewFingerprint,
      totalRows: 1,
      validRows: 1,
      importedRows: 1,
      rows: [staged],
    });
    const commitService = {
      commit: jest.fn().mockImplementation(async (id) => ({
        id,
        status: EmployeeWorkImportStatus.COMPLETED,
        version: 3,
        restoredFromBatchId: 'batch-1',
      })),
      rebuildSnapshots: jest.fn(),
    };
    const dependencies = createService({ foundBatch: source, commitService });
    dependencies.tx.employeeWorkImportBatch.findUnique.mockResolvedValue(source);
    dependencies.tx.employeeWorkImportRow.findMany
      .mockResolvedValueOnce([staged])
      .mockResolvedValueOnce([]);

    const result = await dependencies.service.restore('batch-1');

    const createdBatch = dependencies.tx.employeeWorkImportBatch.create.mock.calls[0][0].data;
    expect(createdBatch).toMatchObject({
      status: EmployeeWorkImportStatus.READY,
      restoredFromBatchId: 'batch-1',
      sourceStorageKey: expect.stringMatching(/^employee-imports\/.+\/source\.xlsx$/),
      fileHash: SOURCE_HASH,
      previewFingerprint,
      totalRows: 1,
      validRows: 1,
      errorRows: 0,
      unresolvedRows: 0,
      importedRows: 0,
    });
    expect(createdBatch.id).not.toBe('batch-1');
    expect(createdBatch.sourceStorageKey).not.toBe(source.sourceStorageKey);
    expect(dependencies.storage.write).toHaveBeenCalledWith({
      key: createdBatch.sourceStorageKey,
      content: SOURCE,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(dependencies.tx.employeeWorkImportRow.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          batchId: createdBatch.id,
          rowNumber: 2,
          resolvedEmployeeId: 'employee-1',
          resolvedProjectId: 'project-1',
          resolvedTaskId: 'task-1',
        }),
      ],
    });
    expect(commitService.commit).toHaveBeenCalledWith(createdBatch.id);
    expect(dependencies.audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_IMPORT_RESTORED', outcome: 'SUCCEEDED' }),
      expect.anything(),
    );
    expect(dependencies.tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      id: createdBatch.id,
      restoredFromBatchId: 'batch-1',
      sourceBatchIds: [createdBatch.id],
    });
  });

  it('restores a V2 source whose global batch sequence starts at row 1', async () => {
    const normalized = {
      ...normalizedV2Current(),
      rowNumber: 1,
    };
    const staged = {
      id: 'row-v2-1',
      batchId: 'batch-1',
      rowNumber: 1,
      sourceSheetName: '匿名员工',
      sourceSection: 'CURRENT_WORK',
      sourceRowNumber: 7,
      sourceKey: '匿名员工:CURRENT_WORK:7',
      rawValues: normalized.rawValues,
      normalizedValues: normalized,
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
      riskDecision: 'KEEP',
      riskText: normalized.riskText,
    };
    const previewFingerprint = employeeImportFingerprint({
      fileHash: SOURCE_HASH,
      templateVersion: 2,
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      rows: [
        {
          rowNumber: staged.rowNumber,
          rawValues: staged.rawValues,
          normalizedValues: staged.normalizedValues,
          status: staged.status,
          errors: staged.errors,
          resolvedEmployeeId: staged.resolvedEmployeeId,
          resolvedProjectId: staged.resolvedProjectId,
          resolvedTaskId: staged.resolvedTaskId,
          keepUnlinked: staged.keepUnlinked,
          sourceSheetName: staged.sourceSheetName,
          sourceSection: staged.sourceSection,
          sourceRowNumber: staged.sourceRowNumber,
          sourceKey: staged.sourceKey,
          workKind: staged.workKind,
          plannedHours: staged.plannedHours,
          actualHours: staged.actualHours,
          profileAction: staged.profileAction,
          riskDecision: staged.riskDecision,
          riskText: staged.riskText,
        },
      ],
    });
    const source = batch({
      version: 1,
      status: EmployeeWorkImportStatus.SUPERSEDED,
      templateVersion: 2,
      previewFingerprint,
      totalRows: 1,
      validRows: 1,
      importedRows: 1,
      rows: [staged],
    });
    const commitService = {
      commit: jest.fn().mockImplementation(async (id) => ({
        id,
        status: EmployeeWorkImportStatus.COMPLETED,
        restoredFromBatchId: 'batch-1',
      })),
      rebuildSnapshots: jest.fn(),
    };
    const dependencies = createService({ foundBatch: source, commitService });
    dependencies.tx.employeeWorkImportBatch.findUnique.mockResolvedValue(source);
    dependencies.tx.employeeWorkImportRow.findMany.mockImplementation(
      async ({ where }: { where: { rowNumber: { gt: number } } }) =>
        where.rowNumber.gt < 1 ? [staged] : [],
    );

    await dependencies.service.restore('batch-1');

    expect(dependencies.tx.employeeWorkImportRow.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ rowNumber: { gt: 0 } }),
      }),
    );
    expect(dependencies.tx.employeeWorkImportRow.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ rowNumber: 1, sourceSection: 'CURRENT_WORK' })],
    });
  });

  it('reads and copies 50000 restored rows in chunks of at most 1000', async () => {
    const rowCount = 50_000;
    const source = batch({
      version: 1,
      status: EmployeeWorkImportStatus.SUPERSEDED,
      previewFingerprint: largeRestoreFingerprint(rowCount),
      totalRows: rowCount,
      validRows: rowCount,
      importedRows: rowCount,
    });
    const commitService = {
      commit: jest.fn().mockImplementation(async (id) => ({
        id,
        status: EmployeeWorkImportStatus.COMPLETED,
        restoredFromBatchId: 'batch-1',
      })),
      rebuildSnapshots: jest.fn(),
    };
    const dependencies = createService({ foundBatch: source, commitService });
    dependencies.tx.employeeWorkImportBatch.findUnique.mockResolvedValue(source);
    dependencies.tx.employeeWorkImportRow.findMany.mockImplementation(
      async ({ where, take }: { where: any; take?: number }) => {
        expect(take).toBeDefined();
        expect(take).toBeLessThanOrEqual(1_000);
        const after = Math.max(where.rowNumber?.gt ?? 0, 1);
        if (after >= rowCount + 1) return [];
        const start = after + 1;
        const size = Math.min(take!, rowCount + 2 - start);
        return Array.from({ length: size }, (_, index) => restorableStoredRow(start + index));
      },
    );

    await dependencies.service.restore('batch-1');

    expect(dependencies.tx.employeeWorkImportRow.createMany).toHaveBeenCalledTimes(50);
    expect(
      dependencies.tx.employeeWorkImportRow.createMany.mock.calls.every(
        ([{ data }]) => data.length <= 1_000,
      ),
    ).toBe(true);
    expect(
      dependencies.tx.employeeWorkImportRow.createMany.mock.calls.reduce(
        (total, [{ data }]) => total + data.length,
        0,
      ),
    ).toBe(rowCount);
  });

  it('reuses an in-flight restored batch under idempotent retries', async () => {
    const source = batch({ status: EmployeeWorkImportStatus.SUPERSEDED });
    const existing = batch({
      id: 'restored-batch',
      status: EmployeeWorkImportStatus.READY,
      restoredFromBatchId: 'batch-1',
    });
    const commitService = {
      commit: jest.fn().mockResolvedValue({
        id: 'restored-batch',
        status: EmployeeWorkImportStatus.COMPLETED,
        restoredFromBatchId: 'batch-1',
      }),
      rebuildSnapshots: jest.fn(),
    };
    const dependencies = createService({
      foundBatch: source,
      existingBatch: existing,
      commitService,
    });

    await expect(dependencies.service.restore('batch-1')).resolves.toMatchObject({
      id: 'restored-batch',
      sourceBatchIds: ['restored-batch'],
    });
    expect(dependencies.storage.read).not.toHaveBeenCalled();
    expect(dependencies.storage.write).not.toHaveBeenCalled();
    expect(dependencies.tx.employeeWorkImportBatch.create).not.toHaveBeenCalled();
    expect(commitService.commit).toHaveBeenCalledWith('restored-batch');
  });

  it('rejects restore from a draft batch before reading or copying source storage', async () => {
    const dependencies = createService({
      foundBatch: batch({ status: EmployeeWorkImportStatus.READY }),
      commitService: { commit: jest.fn(), rebuildSnapshots: jest.fn() },
    });

    await expect(dependencies.service.restore('batch-1')).rejects.toMatchObject({
      code: 'EMPLOYEE_IMPORT_STATE_INVALID',
      statusCode: 409,
    });
    expect(dependencies.storage.read).not.toHaveBeenCalled();
    expect(dependencies.storage.write).not.toHaveBeenCalled();
  });

  it.each([
    {
      operation: 'upload',
      run: (dependencies: ReturnType<typeof createService>) =>
        dependencies.service.upload(undefined),
      action: 'EMPLOYEE_IMPORT_UPLOAD_FAILED',
      entityId: undefined,
    },
    {
      operation: 'preview',
      run: (dependencies: ReturnType<typeof createService>) =>
        dependencies.service.preview('batch-1'),
      action: 'EMPLOYEE_IMPORT_PREVIEW_FAILED',
      entityId: 'batch-1',
      foundBatch: batch({ status: EmployeeWorkImportStatus.COMPLETED }),
    },
    {
      operation: 'resolution',
      run: (dependencies: ReturnType<typeof createService>) =>
        dependencies.service.resolve('batch-1', { rows: [] }),
      action: 'EMPLOYEE_IMPORT_RESOLUTION_FAILED',
      entityId: 'batch-1',
      foundBatch: batch(),
    },
  ])(
    'audits a failed $operation without hiding the original error',
    async ({ run, action, entityId, foundBatch }) => {
      const dependencies = createService({ foundBatch });

      await expect(run(dependencies)).rejects.toBeDefined();
      expect(dependencies.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action,
          entityType: 'employeeWorkImportBatch',
          entityId,
          outcome: 'FAILED',
          metadata: expect.objectContaining({ errorCode: expect.any(String) }),
        }),
      );
    },
  );

  it('audits a failed restore attempt', async () => {
    const dependencies = createService({
      foundBatch: batch({ status: EmployeeWorkImportStatus.READY }),
      commitService: { commit: jest.fn(), rebuildSnapshots: jest.fn() },
    });

    await expect(dependencies.service.restore('batch-1')).rejects.toBeDefined();
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_IMPORT_RESTORE_FAILED',
        entityId: 'batch-1',
        outcome: 'FAILED',
      }),
    );
  });
});
