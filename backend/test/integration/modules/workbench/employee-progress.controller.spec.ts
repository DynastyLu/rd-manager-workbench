import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  EmployeeImportRowStatus,
  EmployeeProgressPeriod,
  EmployeeSnapshotStatus,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { employeeImportFingerprint } from '../../../../src/modules/workbench/employees/application/employee-import-fingerprint';
import { NormalizedEmployeeWorkRow } from '../../../../src/modules/workbench/employees/domain/employee-work.types';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Employee progress and import history API', () => {
  jest.setTimeout(60_000);

  const fixtureMarker = 'TEST-EMPLOYEE-PROGRESS-';
  const prefix = `${fixtureMarker}${Date.now()}`;
  const sourceBatchId = randomUUID();
  const currentBatchId = randomUUID();
  const weekOffset = Number.parseInt(sourceBatchId.replaceAll('-', '').slice(0, 12), 16) % 300_000;
  const periodStart = new Date(
    new Date('2040-01-02T00:00:00.000Z').getTime() + weekOffset * 7 * 86_400_000,
  );
  const periodEnd = new Date(periodStart.getTime() + 6 * 86_400_000);
  const periodStartText = periodStart.toISOString().slice(0, 10);
  const periodEndText = periodEnd.toISOString().slice(0, 10);
  const invalidWeekStartText = new Date(periodStart.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const sourceRowId = randomUUID();
  const currentRowId = randomUUID();
  const currentIssueRowId = randomUUID();
  const sourceWorkItemId = randomUUID();
  const currentWorkItemId = randomUUID();
  const sourceStorageKey = `employee-imports/${sourceBatchId}/source.xlsx`;
  const currentStorageKey = `employee-imports/${currentBatchId}/source.xlsx`;
  const sourceContent = Buffer.from(`${prefix}-source-workbook`);
  const currentContent = Buffer.from(`${prefix}-current-workbook`);
  const prisma = new PrismaClient();
  const batchIds: string[] = [sourceBatchId, currentBatchId];
  let app: INestApplication;
  let storage: StoragePort;
  let employeeId: string;
  let projectId: string;
  let taskId: string;

  function normalizedRow(
    rowNumber: number,
    title: string,
    summaryText: string,
  ): NormalizedEmployeeWorkRow {
    const rawValues = {
      员工姓名: `${prefix}-员工`,
      工作内容: title,
      本期完成情况: summaryText,
      完成度: 100,
      工作状态: '已完成',
      计划工时: 8,
      实际工时: 7,
      项目编号: `${prefix}-PROJECT`,
      任务编号: `${prefix}-TASK`,
    };
    return {
      rowNumber,
      employeeName: `${prefix}-员工`,
      title,
      planText: '按计划完成',
      summaryText,
      completionRate: 100,
      status: EmployeeWorkStatus.COMPLETED,
      nextPlanText: '继续联调',
      riskText: null,
      plannedHours: 8,
      actualHours: 7,
      projectCode: `${prefix}-PROJECT`,
      taskCode: `${prefix}-TASK`,
      note: null,
      rawValues,
    };
  }

  function fingerprint(fileHash: string, row: NormalizedEmployeeWorkRow) {
    return employeeImportFingerprint({
      fileHash,
      templateVersion: 1,
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: periodStartText,
      periodEnd: periodEndText,
      rows: [
        {
          rowNumber: row.rowNumber,
          rawValues: row.rawValues,
          normalizedValues: row,
          status: EmployeeImportRowStatus.VALID,
          errors: [],
          resolvedEmployeeId: employeeId,
          resolvedProjectId: projectId,
          resolvedTaskId: taskId,
          keepUnlinked: false,
        },
      ],
    });
  }

  async function cleanupFixtures(): Promise<void> {
    const [batches, projects, employees] = await Promise.all([
      prisma.employeeWorkImportBatch.findMany({
        where: { originalName: { startsWith: fixtureMarker } },
        select: { id: true, sourceStorageKey: true, errorStorageKey: true },
      }),
      prisma.project.findMany({
        where: { code: { startsWith: fixtureMarker } },
        select: { id: true },
      }),
      prisma.resourceProfile.findMany({
        where: { displayName: { startsWith: fixtureMarker } },
        select: { id: true },
      }),
    ]);
    const staleBatchIds = batches.map(({ id }) => id);
    const projectIds = projects.map(({ id }) => id);
    const employeeIds = employees.map(({ id }) => id);
    if (staleBatchIds.length > 0) {
      await prisma.resourceLoadEntry.deleteMany({
        where: { employeeWorkImportBatchId: { in: staleBatchIds } },
      });
      await prisma.employeeProgressSnapshot.deleteMany({
        where: { sourceBatchIds: { hasSome: staleBatchIds } },
      });
      await prisma.employeeWorkItem.deleteMany({
        where: { importBatchId: { in: staleBatchIds } },
      });
      await prisma.employeeWorkImportRow.deleteMany({
        where: { batchId: { in: staleBatchIds } },
      });
      await prisma.employeeWorkImportBatch.deleteMany({
        where: { id: { in: staleBatchIds } },
      });
    }
    if (projectIds.length > 0) {
      await prisma.risk.deleteMany({ where: { projectId: { in: projectIds } } });
    }
    await prisma.workTask.deleteMany({
      where: {
        OR: [
          { code: { startsWith: fixtureMarker } },
          ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
        ],
      },
    });
    if (projectIds.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    if (employeeIds.length > 0) {
      await prisma.resourceProfile.deleteMany({ where: { id: { in: employeeIds } } });
    }
    const storageKeys = batches.flatMap(({ sourceStorageKey, errorStorageKey }) => [
      sourceStorageKey,
      ...(errorStorageKey ? [errorStorageKey] : []),
    ]);
    await Promise.all(storageKeys.map((key) => storage.delete(key).catch(() => undefined)));
  }

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
    storage = app.get(StoragePort);
    await cleanupFixtures();

    const employee = await prisma.resourceProfile.create({
      data: {
        displayName: `${prefix}-员工`,
        department: `${prefix}-研发部`,
        roleTitle: '高级工程师',
      },
    });
    employeeId = employee.id;
    const project = await prisma.project.create({
      data: { code: `${prefix}-PROJECT`, name: `${prefix}-项目` },
    });
    projectId = project.id;
    const task = await prisma.workTask.create({
      data: { code: `${prefix}-TASK`, title: `${prefix}-任务`, projectId },
    });
    taskId = task.id;

    await storage.write({
      key: sourceStorageKey,
      content: sourceContent,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await storage.write({
      key: currentStorageKey,
      content: currentContent,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const sourceRow = normalizedRow(2, `${prefix}-旧版本工作`, '旧版本已完成');
    const currentRow = normalizedRow(2, `${prefix}-当前版本工作`, '当前版本已完成');
    const sourceHash = createHash('sha256').update(sourceContent).digest('hex');
    const currentHash = createHash('sha256').update(currentContent).digest('hex');
    await prisma.employeeWorkImportBatch.create({
      data: {
        id: sourceBatchId,
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        version: 1,
        status: EmployeeWorkImportStatus.SUPERSEDED,
        snapshotStatus: EmployeeSnapshotStatus.READY,
        originalName: `${prefix}-source.xlsx`,
        fileHash: sourceHash,
        sourceStorageKey,
        templateVersion: 1,
        previewFingerprint: fingerprint(sourceHash, sourceRow),
        totalRows: 1,
        validRows: 1,
        importedRows: 1,
        committedAt: new Date('2040-01-03T00:00:00.000Z'),
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
    await prisma.employeeWorkImportRow.create({
      data: {
        id: sourceRowId,
        batchId: sourceBatchId,
        rowNumber: sourceRow.rowNumber,
        rawValues: sourceRow.rawValues,
        normalizedValues: sourceRow as unknown as Prisma.InputJsonValue,
        status: EmployeeImportRowStatus.VALID,
        errors: [],
        resolvedEmployeeId: employeeId,
        resolvedProjectId: projectId,
        resolvedTaskId: taskId,
      },
    });
    await prisma.employeeWorkItem.create({
      data: {
        id: sourceWorkItemId,
        employeeId,
        importBatchId: sourceBatchId,
        sourceRowId,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        title: sourceRow.title,
        planText: sourceRow.planText,
        summaryText: sourceRow.summaryText,
        completionRate: sourceRow.completionRate,
        status: sourceRow.status,
        nextPlanText: sourceRow.nextPlanText,
        plannedHours: sourceRow.plannedHours,
        actualHours: sourceRow.actualHours,
        projectId,
        taskId,
        rawRow: sourceRow.rawValues,
        archivedAt: new Date('2040-01-04T00:00:00.000Z'),
      },
    });

    await prisma.employeeWorkImportBatch.create({
      data: {
        id: currentBatchId,
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        version: 2,
        status: EmployeeWorkImportStatus.COMPLETED,
        snapshotStatus: EmployeeSnapshotStatus.READY,
        originalName: `${prefix}-current.xlsx`,
        fileHash: currentHash,
        sourceStorageKey: currentStorageKey,
        templateVersion: 1,
        previewFingerprint: fingerprint(currentHash, currentRow),
        totalRows: 2,
        validRows: 1,
        errorRows: 1,
        importedRows: 1,
        supersedesBatchId: sourceBatchId,
        committedAt: new Date('2040-01-04T00:00:00.000Z'),
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
    await prisma.employeeWorkImportRow.create({
      data: {
        id: currentRowId,
        batchId: currentBatchId,
        rowNumber: currentRow.rowNumber,
        rawValues: currentRow.rawValues,
        normalizedValues: currentRow as unknown as Prisma.InputJsonValue,
        status: EmployeeImportRowStatus.VALID,
        errors: [],
        resolvedEmployeeId: employeeId,
        resolvedProjectId: projectId,
        resolvedTaskId: taskId,
      },
    });
    await prisma.employeeWorkImportRow.create({
      data: {
        id: currentIssueRowId,
        batchId: currentBatchId,
        rowNumber: 3,
        rawValues: { 员工姓名: '', 工作内容: `${prefix}-问题行` },
        normalizedValues: {},
        status: EmployeeImportRowStatus.ERROR,
        errors: [{ field: 'employeeName', code: 'REQUIRED' }],
        resolvedEmployeeId: null,
        resolvedProjectId: null,
        resolvedTaskId: null,
      },
    });
    await prisma.employeeWorkItem.create({
      data: {
        id: currentWorkItemId,
        employeeId,
        importBatchId: currentBatchId,
        sourceRowId: currentRowId,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        title: currentRow.title,
        planText: currentRow.planText,
        summaryText: currentRow.summaryText,
        completionRate: currentRow.completionRate,
        status: currentRow.status,
        nextPlanText: currentRow.nextPlanText,
        plannedHours: currentRow.plannedHours,
        actualHours: currentRow.actualHours,
        projectId,
        taskId,
        rawRow: currentRow.rawValues,
      },
    });
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        await app?.close();
      }
    }
  });

  it('reads only current facts through team, employee, project, and work-item drill-throughs', async () => {
    const query = {
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: periodStartText,
    };
    const team = await request(app.getHttpServer())
      .get('/api/employee-progress')
      .query({ ...query, department: `${prefix}-研发部` })
      .expect(200);
    expect(team.body.data).toMatchObject({
      period: { type: EmployeeProgressPeriod.WEEK, start: periodStartText, end: periodEndText },
      metrics: { workItemCount: 1, completedCount: 1, dataComplete: true },
      sourceBatchIds: [currentBatchId],
      employees: {
        data: [
          expect.objectContaining({
            employeeId,
            sourceBatchIds: [currentBatchId],
          }),
        ],
        total: 1,
        hasMore: false,
      },
      projects: {
        data: [
          expect.objectContaining({
            projectId,
            projectCode: `${prefix}-PROJECT`,
            sourceBatchIds: [currentBatchId],
          }),
        ],
        total: 1,
        hasMore: false,
      },
      risks: { data: [], total: 0, hasMore: false },
    });
    expect(JSON.stringify(team.body)).not.toContain(`${prefix}-旧版本工作`);

    const employee = await request(app.getHttpServer())
      .get(`/api/employees/${employeeId}/progress`)
      .query(query)
      .expect(200);
    expect(employee.body.data).toMatchObject({
      employee: { id: employeeId },
      metrics: { workItemCount: 1 },
      sourceBatchIds: [currentBatchId],
    });
    const project = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/team-progress`)
      .query(query)
      .expect(200);
    expect(project.body.data).toMatchObject({
      project: { id: projectId },
      metrics: { workItemCount: 1 },
      sourceBatchIds: [currentBatchId],
    });

    const items = await request(app.getHttpServer())
      .get('/api/employee-work-items')
      .query({ ...query, employeeId, projectId, pageSize: 1 })
      .expect(200);
    expect(items.body.data).toMatchObject({
      data: [
        expect.objectContaining({
          title: `${prefix}-当前版本工作`,
          sourceBatchIds: [currentBatchId],
        }),
      ],
      meta: { page: 1, pageSize: 1, total: 1 },
      sourceBatchIds: [currentBatchId],
    });
    expect(items.body.data.data[0].links).toMatchObject({
      employeeProgressUrl: expect.stringContaining(
        `/employees/${employeeId}/progress?periodType=WEEK`,
      ),
      projectProgressUrl: expect.stringContaining(
        `/projects/${projectId}/team-progress?periodType=WEEK`,
      ),
      sourceBatchUrl: `/employee-work-imports/${currentBatchId}`,
    });
    const itemId = items.body.data.data[0].id as string;
    await request(app.getHttpServer())
      .get(`/api/employee-work-items/${itemId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: itemId, sourceBatchIds: [currentBatchId] });
      });

    await request(app.getHttpServer())
      .get('/api/employee-progress')
      .query({ periodType: EmployeeProgressPeriod.WEEK, periodStart: invalidWeekStartText })
      .expect(400);
  });

  it('lists import history, returns batch detail and downloads the original source', async () => {
    const history = await request(app.getHttpServer())
      .get('/api/employee-work-imports')
      .query({ periodType: EmployeeProgressPeriod.WEEK, periodStart: periodStartText })
      .expect(200);
    expect(history.body.data).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: sourceBatchId,
          status: EmployeeWorkImportStatus.SUPERSEDED,
          periodStart: periodStartText,
          periodEnd: periodEndText,
          sourceAvailable: true,
          sourceBatchIds: [sourceBatchId],
          links: expect.objectContaining({
            source: `/employee-work-imports/${sourceBatchId}/source`,
            restore: `/employee-work-imports/${sourceBatchId}/restore`,
          }),
        }),
        expect.objectContaining({
          id: currentBatchId,
          status: EmployeeWorkImportStatus.COMPLETED,
        }),
      ]),
      meta: { page: 1, pageSize: 20, total: 2 },
    });

    await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${sourceBatchId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: sourceBatchId,
          sourceBatchIds: [sourceBatchId],
          rows: [
            expect.objectContaining({
              rowNumber: 2,
              resolvedEmployeeId: employeeId,
              resolvedProjectId: projectId,
              resolvedTaskId: taskId,
            }),
          ],
          rowMeta: { page: 1, pageSize: 20, total: 1 },
        });
        expect(body.data).not.toHaveProperty('sourceStorageKey');
        expect(body.data).not.toHaveProperty('previewFingerprint');
      });

    await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${currentBatchId}`)
      .query({
        rowStatus: EmployeeImportRowStatus.ERROR,
        issuesOnly: true,
        rowsPage: 1,
        rowsPageSize: 1,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          rows: [
            expect.objectContaining({
              rowNumber: 3,
              status: EmployeeImportRowStatus.ERROR,
            }),
          ],
          rowMeta: { page: 1, pageSize: 1, total: 1 },
        });
      });
    await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${currentBatchId}`)
      .query({ issuesOnly: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.rowMeta).toMatchObject({ total: 2 });
      });
    await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${currentBatchId}`)
      .query({ rowStatus: 'INVALID' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${currentBatchId}`)
      .query({ issuesOnly: '1' })
      .expect(400);

    const downloaded = await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${sourceBatchId}/source`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', (error) => callback(error as Error, undefined));
      })
      .expect(200);
    expect(downloaded.body).toEqual(sourceContent);
    expect(downloaded.headers['x-source-batch-ids']).toBe(sourceBatchId);
  });

  it('exports all current filtered work and converts one eligible work risk idempotently', async () => {
    await prisma.employeeWorkItem.update({
      where: { id: currentWorkItemId },
      data: {
        title: `=${prefix}-公式工作`,
        status: EmployeeWorkStatus.AT_RISK,
        riskText: `${prefix}-权限依赖未就绪`,
      },
    });

    const csv = await request(app.getHttpServer())
      .get('/api/employee-work-items/export')
      .query({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: periodStartText,
        employeeId,
        projectId,
        status: EmployeeWorkStatus.AT_RISK,
        format: 'csv',
      })
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['x-source-batch-ids']).toBe(currentBatchId);
    expect(csv.text).toContain(`'=${prefix}-公式工作`);
    expect(csv.text).not.toContain(`${prefix}-旧版本工作`);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/employee-work-items/${currentWorkItemId}/convert-risk`)
        .send({})
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/employee-work-items/${currentWorkItemId}/convert-risk`)
        .send({})
        .expect(201),
    ]);
    expect(first.body.data.risk.id).toBe(second.body.data.risk.id);
    expect([first.body.data.alreadyExists, second.body.data.alreadyExists].sort()).toEqual([
      false,
      true,
    ]);
    await expect(
      prisma.employeeWorkItem.findUniqueOrThrow({
        where: { id: currentWorkItemId },
        select: { riskId: true },
      }),
    ).resolves.toEqual({ riskId: first.body.data.risk.id });
    await expect(
      prisma.risk.findUniqueOrThrow({ where: { id: first.body.data.risk.id } }),
    ).resolves.toMatchObject({
      likelihood: 'MEDIUM',
      impact: 'MEDIUM',
      level: 'MEDIUM',
      projectId,
      taskId,
    });
    await request(app.getHttpServer())
      .post(`/api/employee-work-items/${sourceWorkItemId}/convert-risk`)
      .send({})
      .expect(404);

    const audits = await prisma.auditLog.findMany({
      where: {
        entityType: 'employeeWorkItem',
        entityId: currentWorkItemId,
        action: 'EMPLOYEE_WORK_RISK_CONVERTED',
      },
      select: { outcome: true },
    });
    expect(audits).toHaveLength(2);
    expect(audits.every(({ outcome }) => outcome === 'SUCCEEDED')).toBe(true);
  });

  it('restores a superseded batch once under concurrent retries and preserves every version and source', async () => {
    const [left, right] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/employee-work-imports/${sourceBatchId}/restore`)
        .send({})
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/employee-work-imports/${sourceBatchId}/restore`)
        .send({})
        .expect(201),
    ]);
    const restoredId = left.body.data.id as string;
    expect(right.body.data.id).toBe(restoredId);
    expect(left.body.data).toMatchObject({
      id: restoredId,
      restoredFromBatchId: sourceBatchId,
      supersedesBatchId: currentBatchId,
      status: EmployeeWorkImportStatus.COMPLETED,
      version: 3,
      sourceBatchIds: [restoredId],
    });

    const versions = await prisma.employeeWorkImportBatch.findMany({
      where: {
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: periodStart,
        id: { in: [...batchIds, restoredId] },
      },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        version: true,
        status: true,
        restoredFromBatchId: true,
        sourceStorageKey: true,
      },
    });
    expect(versions).toHaveLength(3);
    expect(versions).toEqual([
      expect.objectContaining({
        id: sourceBatchId,
        version: 1,
        status: EmployeeWorkImportStatus.SUPERSEDED,
      }),
      expect.objectContaining({
        id: currentBatchId,
        version: 2,
        status: EmployeeWorkImportStatus.SUPERSEDED,
      }),
      expect.objectContaining({
        id: restoredId,
        version: 3,
        status: EmployeeWorkImportStatus.COMPLETED,
        restoredFromBatchId: sourceBatchId,
      }),
    ]);
    expect(versions[2].sourceStorageKey).not.toBe(sourceStorageKey);
    await expect(storage.read(sourceStorageKey)).resolves.toMatchObject({ content: sourceContent });
    await expect(storage.read(versions[2].sourceStorageKey)).resolves.toMatchObject({
      content: sourceContent,
    });
    await expect(
      prisma.employeeWorkItem.findMany({
        where: { importBatchId: restoredId, archivedAt: null },
        select: { title: true },
      }),
    ).resolves.toEqual([{ title: `${prefix}-旧版本工作` }]);
  });
});
