import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  EmployeeImportRowStatus,
  EmployeeProgressPeriod,
  EmployeeProgressScope,
  EmployeeSnapshotStatus,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  LoadEntryKind,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { EmployeeProgressSnapshotService } from '../../../../src/modules/workbench/employees/application/employee-progress-snapshot.service';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Employee work imports API', () => {
  jest.setTimeout(240_000);

  const DAY_MS = 86_400_000;
  const prisma = new PrismaClient();
  const prefix = `TEST-EMPLOYEE-IMPORT-${Date.now()}`;
  const employeeName = `${prefix}-张明`;
  const projectCode = `${prefix}-PROJECT`;
  const taskCode = `${prefix}-TASK`;
  let app: INestApplication;
  let employeeId: string;
  let projectId: string;
  let taskId: string;
  const batchIds: string[] = [];
  let isolatedWeekOffset = 0;

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

    const employee = await prisma.resourceProfile.create({
      data: { displayName: employeeName },
    });
    employeeId = employee.id;
    const project = await prisma.project.create({
      data: { code: projectCode, name: `${prefix} 项目` },
    });
    projectId = project.id;
    const task = await prisma.workTask.create({
      data: { code: taskCode, title: `${prefix} 任务`, projectId },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    try {
      const batches = await prisma.employeeWorkImportBatch.findMany({
        where: { id: { in: batchIds } },
        select: { sourceStorageKey: true, errorStorageKey: true },
      });
      if (app) {
        const storage = app.get(StoragePort);
        for (const batch of batches) {
          await storage.delete(batch.sourceStorageKey).catch(() => undefined);
          if (batch.errorStorageKey) {
            await storage.delete(batch.errorStorageKey).catch(() => undefined);
          }
        }
      }
      await prisma.resourceLoadEntry.deleteMany({
        where: { employeeWorkImportBatchId: { in: batchIds } },
      });
      await prisma.employeeProgressSnapshot.deleteMany({
        where: { sourceBatchIds: { hasSome: batchIds } },
      });
      await prisma.employeeWorkItem.deleteMany({ where: { importBatchId: { in: batchIds } } });
      await prisma.employeeWorkImportRow.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.employeeWorkImportBatch.deleteMany({ where: { id: { in: batchIds } } });
      if (taskId) await prisma.workTask.deleteMany({ where: { id: taskId } });
      if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
      if (employeeId) await prisma.resourceProfile.deleteMany({ where: { id: employeeId } });
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        await app?.close();
      }
    }
  });

  async function workbookBuffer(
    label = '',
    periodStart = new Date(Date.UTC(2026, 6, 20)),
    periodEnd = new Date(Date.UTC(2026, 6, 26)),
  ): Promise<Buffer> {
    const template = await new EmployeeWorkbookService().template();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0], {
      ignoreNodes: ['dataValidations'],
    });
    const instructions = workbook.getWorksheet('说明');
    const details = workbook.getWorksheet('工作明细');
    if (!instructions || !details) throw new Error('Employee workbook sheets are missing');
    instructions.getCell('B4').value = periodStart;
    instructions.getCell('B5').value = periodEnd;
    details.addRow([
      employeeName,
      `实现员工周报导入${label ? ` ${label}` : ''}`,
      '完成接口设计',
      '完成开发',
      90,
      '进行中',
      '联调',
      null,
      8,
      7,
      projectCode,
      taskCode,
      null,
    ]);
    details.addRow([
      employeeName,
      '处理未关联工作',
      null,
      null,
      null,
      '未开始',
      null,
      null,
      null,
      null,
      `${prefix}-UNKNOWN`,
      null,
      null,
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async function uploadPreviewAndResolve(source: Buffer, filename: string): Promise<string> {
    const uploaded = await request(app.getHttpServer())
      .post('/api/employee-work-imports')
      .attach('file', source, {
        filename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201);
    const batchId = uploaded.body.data.id as string;
    batchIds.push(batchId);
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/preview`)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/resolutions`)
      .send({
        rows: [
          {
            rowNumber: 3,
            projectId: null,
            taskId: null,
            keepUnlinked: true,
          },
        ],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.status).toBe(EmployeeWorkImportStatus.READY);
      });
    return batchId;
  }

  function isolatedWeek(): { start: Date; end: Date } {
    const runOffset = (Date.now() % 100_000) + isolatedWeekOffset;
    isolatedWeekOffset += 1;
    const start = new Date(Date.UTC(2030, 0, 7) + runOffset * 7 * DAY_MS);
    return { start, end: new Date(start.getTime() + 6 * DAY_MS) };
  }

  async function withBarrierTimeout<T>(
    promise: Promise<T>,
    stage: string,
    timeoutMs = 10_000,
  ): Promise<T> {
    let timeout!: NodeJS.Timeout;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Timed out at PostgreSQL barrier stage: ${stage}`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  function binaryParser(
    response: request.Response,
    callback: (error: Error | null, body?: Buffer) => void,
  ): void {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    response.on('end', () => callback(null, Buffer.concat(chunks)));
    response.on('error', (error) => callback(error as Error));
  }

  it('uploads, deduplicates, previews, downloads errors, resolves, and cleans a draft without formal writes', async () => {
    const source = await workbookBuffer();
    await request(app.getHttpServer()).post('/api/employee-work-imports').expect(422);

    const [uploaded, concurrentUpload] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/employee-work-imports')
        .attach('file', source, {
          filename: 'weekly.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        .expect(201),
      request(app.getHttpServer())
        .post('/api/employee-work-imports')
        .attach('file', source, {
          filename: 'concurrent.xlsx',
          contentType: 'application/octet-stream',
        })
        .expect(201),
    ]);
    const batchId = uploaded.body.data.id as string;
    batchIds.push(batchId);
    const winnerName = uploaded.body.data.originalName as string;
    expect(concurrentUpload.body.data.id).toBe(batchId);
    expect(concurrentUpload.body.data.originalName).toBe(winnerName);
    expect(['weekly.xlsx', 'concurrent.xlsx']).toContain(winnerName);
    expect(uploaded.body.data).toMatchObject({
      id: batchId,
      status: EmployeeWorkImportStatus.UPLOADED,
      originalName: winnerName,
      hasErrors: false,
    });
    expect(uploaded.body.data).not.toHaveProperty('sourceStorageKey');
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const persistedWinners = await prisma.employeeWorkImportBatch.findMany({
      where: {
        fileHash: sourceHash,
        periodType: 'WEEK',
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
        archivedAt: null,
      },
      select: { id: true, originalName: true, sourceStorageKey: true },
    });
    expect(persistedWinners).toEqual([
      {
        id: batchId,
        originalName: winnerName,
        sourceStorageKey: `employee-imports/${batchId}/source.xlsx`,
      },
    ]);
    const storage = app.get(StoragePort);
    const sourceEntries = (await storage.walk('employee-imports')).filter(
      ({ key, kind }) => kind === 'FILE' && key.endsWith('/source.xlsx'),
    );
    const matchingSourceHashes = await Promise.all(
      sourceEntries.map(async ({ key }) => ({
        key,
        hash: createHash('sha256')
          .update((await storage.read(key)).content)
          .digest('hex'),
      })),
    );
    expect(matchingSourceHashes.filter(({ hash }) => hash === sourceHash)).toEqual([
      {
        key: `employee-imports/${batchId}/source.xlsx`,
        hash: sourceHash,
      },
    ]);

    const duplicate = await request(app.getHttpServer())
      .post('/api/employee-work-imports')
      .attach('file', source, {
        filename: 'duplicate.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201);
    expect(duplicate.body.data.id).toBe(batchId);
    expect(duplicate.body.data.originalName).toBe(winnerName);

    const previewed = await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/preview`)
      .send({})
      .expect(200);
    expect(previewed.body.data).toMatchObject({
      id: batchId,
      status: EmployeeWorkImportStatus.RESOLVING,
      totalRows: 2,
      validRows: 1,
      errorRows: 0,
      unresolvedRows: 1,
      hasErrors: true,
    });
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: batchId } }),
    ).resolves.toBe(0);
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/resolutions`)
      .send({ rows: [] })
      .expect(400);

    const errorDownload = await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${batchId}/errors`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(errorDownload.headers['content-disposition']).toContain('.xlsx');
    const errorsWorkbook = new ExcelJS.Workbook();
    await errorsWorkbook.xlsx.load(
      errorDownload.body as Parameters<typeof errorsWorkbook.xlsx.load>[0],
    );
    expect(errorsWorkbook.getWorksheet('错误行')?.rowCount).toBe(2);

    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/resolutions`)
      .send({
        rows: [
          {
            rowNumber: 3,
            projectId: null,
            taskId: null,
            keepUnlinked: true,
          },
        ],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: batchId,
          status: EmployeeWorkImportStatus.READY,
          totalRows: 2,
          validRows: 2,
          errorRows: 0,
          unresolvedRows: 0,
          hasErrors: false,
        });
      });
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: batchId } }),
    ).resolves.toBe(0);
    await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${batchId}/errors`)
      .expect(404);

    await request(app.getHttpServer()).delete(`/api/employee-work-imports/${batchId}`).expect(204);
    await expect(
      prisma.employeeWorkImportBatch.findUniqueOrThrow({
        where: { id: batchId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: EmployeeWorkImportStatus.EXPIRED });
    await expect(
      prisma.auditLog.count({
        where: {
          entityType: 'employeeWorkImportBatch',
          entityId: batchId,
          action: 'EMPLOYEE_IMPORT_UPLOADED',
        },
      }),
    ).resolves.toBe(1);
  });

  it('rejects a non-v4 UUID route parameter before service lookup', async () => {
    await request(app.getHttpServer())
      .patch('/api/employee-work-imports/not-a-uuid/preview')
      .send({})
      .expect(400);
  });

  it('commits idempotently, replaces the current week, and safely retries reference drift', async () => {
    const expiredId = await uploadPreviewAndResolve(
      await workbookBuffer('expired-ready'),
      'expired-ready.xlsx',
    );
    await prisma.employeeWorkImportBatch.update({
      where: { id: expiredId },
      data: { expiresAt: new Date('2026-07-23T00:00:00.000Z') },
    });
    await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${expiredId}/commit`)
      .send({})
      .expect(410);
    await expect(
      prisma.employeeWorkImportBatch.findUniqueOrThrow({
        where: { id: expiredId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: EmployeeWorkImportStatus.READY });
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: expiredId } }),
    ).resolves.toBe(0);

    const v1Id = await uploadPreviewAndResolve(await workbookBuffer('commit-v1'), 'commit-v1.xlsx');
    const firstCommit = await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${v1Id}/commit`)
      .send({})
      .expect(201);
    const v1Version = firstCommit.body.data.version as number;
    expect(firstCommit.body.data).toMatchObject({
      id: v1Id,
      status: EmployeeWorkImportStatus.COMPLETED,
      version: expect.any(Number),
      importedRows: 2,
      snapshotStatus: EmployeeSnapshotStatus.READY,
    });
    expect(Number.isInteger(v1Version)).toBe(true);
    expect(v1Version).toBeGreaterThan(0);
    const v1WeeklySnapshots = await prisma.employeeProgressSnapshot.findMany({
      where: {
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        archivedAt: null,
      },
      orderBy: { scopeKey: 'asc' },
    });
    expect(v1WeeklySnapshots.map(({ scopeKey }) => scopeKey)).toEqual([
      `EMPLOYEE:${employeeId}`,
      `PROJECT:${projectId}`,
      'TEAM',
    ]);
    const v1TeamWeekly = v1WeeklySnapshots.find(
      ({ scopeType }) => scopeType === EmployeeProgressScope.TEAM,
    );
    expect(v1TeamWeekly).toMatchObject({
      sourceBatchIds: [v1Id],
      highlights: { workItemIds: [] },
      risks: { workItemIds: [] },
      metrics: {
        workItemCount: 2,
        completedCount: 0,
        completionRate: 0,
        averageCompletionRate: 90,
        plannedHours: 8,
        actualHours: 7,
        riskCount: 0,
        blockedCount: 0,
        projectCount: 1,
        unlinkedCount: 1,
        dataComplete: true,
        missingWeeks: [],
      },
    });
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: v1Id, archivedAt: null } }),
    ).resolves.toBe(2);
    await expect(
      prisma.resourceLoadEntry.count({
        where: { employeeWorkImportBatchId: v1Id, archivedAt: null },
      }),
    ).resolves.toBe(1);

    const idempotent = await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${v1Id}/commit`)
      .send({})
      .expect(201);
    expect(idempotent.body.data).toMatchObject({
      id: v1Id,
      status: EmployeeWorkImportStatus.COMPLETED,
      version: v1Version,
    });
    await expect(prisma.employeeWorkItem.count({ where: { importBatchId: v1Id } })).resolves.toBe(
      2,
    );

    const v2Id = await uploadPreviewAndResolve(await workbookBuffer('commit-v2'), 'commit-v2.xlsx');
    await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${v2Id}/commit`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: v2Id,
          status: EmployeeWorkImportStatus.COMPLETED,
          version: v1Version + 1,
          supersedesBatchId: v1Id,
          snapshotStatus: EmployeeSnapshotStatus.READY,
        });
      });
    const julyTeam = await prisma.employeeProgressSnapshot.findFirstOrThrow({
      where: {
        scopeKey: 'TEAM',
        periodType: EmployeeProgressPeriod.MONTH,
        periodStartAt: new Date('2026-07-01T00:00:00.000Z'),
        archivedAt: null,
      },
    });
    expect(julyTeam.sourceBatchIds).toEqual([v2Id]);
    expect(julyTeam.metrics).toMatchObject({
      workItemCount: 2,
      dataComplete: false,
      missingWeeks: ['2026-06-29', '2026-07-06', '2026-07-13'],
    });
    const activeWeeklyBeforeRebuild = await prisma.employeeProgressSnapshot.findFirstOrThrow({
      where: {
        scopeKey: 'TEAM',
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        archivedAt: null,
      },
      select: { id: true, version: true },
    });
    await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${v2Id}/rebuild-snapshots`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: v2Id,
          status: EmployeeWorkImportStatus.COMPLETED,
          snapshotStatus: EmployeeSnapshotStatus.READY,
        });
      });
    await expect(
      prisma.employeeProgressSnapshot.findUniqueOrThrow({
        where: { id: activeWeeklyBeforeRebuild.id },
        select: { archivedAt: true },
      }),
    ).resolves.toEqual({ archivedAt: expect.any(Date) });
    await expect(
      prisma.employeeProgressSnapshot.findFirstOrThrow({
        where: {
          scopeKey: 'TEAM',
          periodType: EmployeeProgressPeriod.WEEK,
          periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
          archivedAt: null,
        },
        select: { version: true },
      }),
    ).resolves.toEqual({ version: activeWeeklyBeforeRebuild.version + 1 });
    await expect(
      prisma.employeeProgressSnapshot.count({
        where: {
          scopeKey: 'TEAM',
          periodType: EmployeeProgressPeriod.WEEK,
          periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
          archivedAt: null,
        },
      }),
    ).resolves.toBe(1);
    const activeMonthBeforeConcurrentRebuild =
      await prisma.employeeProgressSnapshot.findFirstOrThrow({
        where: {
          scopeKey: 'TEAM',
          periodType: EmployeeProgressPeriod.MONTH,
          periodStartAt: new Date('2026-07-01T00:00:00.000Z'),
          archivedAt: null,
        },
        select: { id: true, version: true },
      });
    const activeWeekBeforeConcurrentRebuild =
      await prisma.employeeProgressSnapshot.findFirstOrThrow({
        where: {
          scopeKey: 'TEAM',
          periodType: EmployeeProgressPeriod.WEEK,
          periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
          archivedAt: null,
        },
        select: { id: true, version: true },
      });
    const concurrentRebuilds = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/api/employee-work-imports/${v2Id}/rebuild-snapshots`)
          .send({})
          .expect(201),
      ),
    );
    expect(
      concurrentRebuilds.every(
        ({ body }) =>
          body.data.id === v2Id &&
          body.data.status === EmployeeWorkImportStatus.COMPLETED &&
          body.data.snapshotStatus === EmployeeSnapshotStatus.READY,
      ),
    ).toBe(true);
    await expect(
      prisma.employeeWorkImportBatch.findUniqueOrThrow({
        where: { id: v2Id },
        select: { snapshotStatus: true },
      }),
    ).resolves.toEqual({ snapshotStatus: EmployeeSnapshotStatus.READY });
    const activeWeekAfterConcurrentRebuild = await prisma.employeeProgressSnapshot.findMany({
      where: {
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        archivedAt: null,
      },
      orderBy: { scopeKey: 'asc' },
      select: { scopeKey: true, version: true },
    });
    const activeMonthAfterConcurrentRebuild = await prisma.employeeProgressSnapshot.findMany({
      where: {
        periodType: EmployeeProgressPeriod.MONTH,
        periodStartAt: new Date('2026-07-01T00:00:00.000Z'),
        archivedAt: null,
      },
      orderBy: { scopeKey: 'asc' },
      select: { scopeKey: true, version: true },
    });
    expect(activeWeekAfterConcurrentRebuild.map(({ scopeKey }) => scopeKey)).toEqual([
      `EMPLOYEE:${employeeId}`,
      `PROJECT:${projectId}`,
      'TEAM',
    ]);
    expect(activeMonthAfterConcurrentRebuild.map(({ scopeKey }) => scopeKey)).toEqual([
      `EMPLOYEE:${employeeId}`,
      `PROJECT:${projectId}`,
      'TEAM',
    ]);
    expect(
      activeWeekAfterConcurrentRebuild.find(({ scopeKey }) => scopeKey === 'TEAM')?.version,
    ).toBe(activeWeekBeforeConcurrentRebuild.version + 2);
    expect(
      activeMonthAfterConcurrentRebuild.find(({ scopeKey }) => scopeKey === 'TEAM')?.version,
    ).toBe(activeMonthBeforeConcurrentRebuild.version + 2);
    await expect(
      prisma.employeeProgressSnapshot.findMany({
        where: {
          id: {
            in: [activeWeekBeforeConcurrentRebuild.id, activeMonthBeforeConcurrentRebuild.id],
          },
        },
        select: { archivedAt: true },
      }),
    ).resolves.toEqual([{ archivedAt: expect.any(Date) }, { archivedAt: expect.any(Date) }]);
    await expect(
      prisma.employeeWorkImportBatch.findUniqueOrThrow({
        where: { id: v1Id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: EmployeeWorkImportStatus.SUPERSEDED });
    await expect(
      prisma.employeeWorkItem.count({
        where: { importBatchId: v1Id, archivedAt: { not: null } },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.resourceLoadEntry.count({
        where: { employeeWorkImportBatchId: v1Id, archivedAt: { not: null } },
      }),
    ).resolves.toBe(1);

    const driftId = await uploadPreviewAndResolve(
      await workbookBuffer('reference-drift'),
      'reference-drift.xlsx',
    );
    let releaseTaskUpdate!: () => void;
    let taskUpdateLocked!: () => void;
    const taskUpdateIsLocked = new Promise<void>((resolve) => {
      taskUpdateLocked = resolve;
    });
    const releaseTaskUpdateBarrier = new Promise<void>((resolve) => {
      releaseTaskUpdate = resolve;
    });
    const archiveTask = prisma.$transaction(async (tx) => {
      await tx.workTask.update({
        where: { id: taskId },
        data: { archivedAt: new Date() },
      });
      taskUpdateLocked();
      await releaseTaskUpdateBarrier;
    });
    await taskUpdateIsLocked;
    const driftCommit = request(app.getHttpServer())
      .post(`/api/employee-work-imports/${driftId}/commit`)
      .send({})
      .then((response) => response);
    const lockOutcome = await Promise.race([
      driftCommit.then(() => 'completed'),
      new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), 300)),
    ]);
    releaseTaskUpdate();
    await archiveTask;
    expect(lockOutcome).toBe('waiting');
    expect((await driftCommit).status).toBe(422);
    await expect(
      prisma.employeeWorkImportBatch.findUniqueOrThrow({
        where: { id: driftId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: EmployeeWorkImportStatus.FAILED });
    await expect(
      prisma.employeeWorkImportBatch.findUniqueOrThrow({
        where: { id: v2Id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: EmployeeWorkImportStatus.COMPLETED });
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: driftId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.resourceLoadEntry.count({
        where: { employeeWorkImportBatchId: driftId },
      }),
    ).resolves.toBe(0);

    await prisma.workTask.update({
      where: { id: taskId },
      data: { archivedAt: null },
    });
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${driftId}/preview`)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${driftId}/resolutions`)
      .send({
        rows: [
          {
            rowNumber: 3,
            projectId: null,
            taskId: null,
            keepUnlinked: true,
          },
        ],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${driftId}/commit`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: driftId,
          status: EmployeeWorkImportStatus.COMPLETED,
          version: v1Version + 2,
          supersedesBatchId: v2Id,
        });
      });
  });

  it('serializes concurrent READY batches for one period into unique current versions', async () => {
    const periodStart = new Date(Date.UTC(2026, 8, 7));
    const periodEnd = new Date(Date.UTC(2026, 8, 13));
    const firstId = await uploadPreviewAndResolve(
      await workbookBuffer('concurrent-a', periodStart, periodEnd),
      'concurrent-a.xlsx',
    );
    const secondId = await uploadPreviewAndResolve(
      await workbookBuffer('concurrent-b', periodStart, periodEnd),
      'concurrent-b.xlsx',
    );

    const responses = await Promise.all(
      [firstId, secondId].map((id) =>
        request(app.getHttpServer())
          .post(`/api/employee-work-imports/${id}/commit`)
          .send({})
          .expect(201),
      ),
    );
    const committed = responses
      .map(
        ({ body }) =>
          body.data as {
            id: string;
            version: number;
            status: string;
            snapshotStatus: EmployeeSnapshotStatus;
          },
      )
      .sort((left, right) => left.version - right.version);
    expect(committed[0].version).toBeGreaterThan(0);
    expect(committed[1].version).toBe(committed[0].version + 1);
    expect(committed.every(({ status }) => status === EmployeeWorkImportStatus.COMPLETED)).toBe(
      true,
    );
    expect(
      committed.some(({ snapshotStatus }) => snapshotStatus === EmployeeSnapshotStatus.READY),
    ).toBe(true);
    const supersededId = committed[0].id;
    const currentId = committed[1].id;

    await expect(
      prisma.employeeWorkImportBatch.findMany({
        where: { id: { in: [firstId, secondId] } },
        orderBy: { version: 'asc' },
        select: { id: true, status: true, version: true, supersedesBatchId: true },
      }),
    ).resolves.toMatchObject([
      {
        id: supersededId,
        status: EmployeeWorkImportStatus.SUPERSEDED,
        version: committed[0].version,
      },
      {
        id: currentId,
        status: EmployeeWorkImportStatus.COMPLETED,
        version: committed[1].version,
        supersedesBatchId: supersededId,
      },
    ]);
    const activeWorkItems = await prisma.employeeWorkItem.findMany({
      where: { importBatchId: { in: [firstId, secondId] }, archivedAt: null },
      select: { importBatchId: true },
    });
    expect(activeWorkItems).toHaveLength(2);
    expect(activeWorkItems.every(({ importBatchId }) => importBatchId === currentId)).toBe(true);
    const activeLoadEntries = await prisma.resourceLoadEntry.findMany({
      where: {
        employeeWorkImportBatchId: { in: [firstId, secondId] },
        archivedAt: null,
      },
      select: { employeeWorkImportBatchId: true },
    });
    expect(activeLoadEntries).toEqual([{ employeeWorkImportBatchId: currentId }]);
    await expect(
      prisma.employeeWorkItem.count({
        where: { importBatchId: supersededId, archivedAt: { not: null } },
      }),
    ).resolves.toBe(2);
  });

  it('rejects a READY batch that stops being current while ensure waits for the period lock', async () => {
    const { start: periodStart, end: periodEnd } = isolatedWeek();
    const staleId = randomUUID();
    const winnerId = randomUUID();
    batchIds.push(staleId, winnerId);
    await prisma.employeeWorkImportBatch.create({
      data: {
        id: staleId,
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        version: 1,
        status: EmployeeWorkImportStatus.COMPLETED,
        snapshotStatus: EmployeeSnapshotStatus.READY,
        originalName: 'stale-ready.xlsx',
        fileHash: `stale-ready-${staleId}`,
        sourceStorageKey: `employee-imports/${staleId}/source.xlsx`,
        templateVersion: 1,
        committedAt: new Date(),
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });

    let periodLocked!: () => void;
    let releasePeriod!: () => void;
    const periodIsLocked = new Promise<void>((resolve) => {
      periodLocked = resolve;
    });
    const releasePeriodBarrier = new Promise<void>((resolve) => {
      releasePeriod = resolve;
    });
    const periodKey = `employee-import-period:${EmployeeProgressPeriod.WEEK}:${periodStart
      .toISOString()
      .slice(0, 10)}`;
    const snapshots = app.get(EmployeeProgressSnapshotService) as unknown as {
      ensureBatch: EmployeeProgressSnapshotService['ensureBatch'];
      lock: (tx: Prisma.TransactionClient, key: string) => Promise<void>;
    };
    const originalLock = snapshots.lock.bind(snapshots);
    let periodWaitStarted!: () => void;
    const periodWaitIsStarted = new Promise<void>((resolve) => {
      periodWaitStarted = resolve;
    });
    const snapshotLock = jest.spyOn(snapshots, 'lock').mockImplementation(async (tx, key) => {
      if (key === periodKey) periodWaitStarted();
      return originalLock(tx, key);
    });
    const holderPrisma = new PrismaClient();
    const supersede = holderPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${periodKey}))`;
      periodLocked();
      await releasePeriodBarrier;
      await tx.employeeWorkImportBatch.update({
        where: { id: staleId },
        data: { status: EmployeeWorkImportStatus.SUPERSEDED },
      });
      await tx.employeeWorkImportBatch.create({
        data: {
          id: winnerId,
          periodType: EmployeeProgressPeriod.WEEK,
          periodStartAt: periodStart,
          periodEndAt: periodEnd,
          version: 2,
          status: EmployeeWorkImportStatus.COMPLETED,
          snapshotStatus: EmployeeSnapshotStatus.READY,
          originalName: 'current-ready.xlsx',
          fileHash: `current-ready-${winnerId}`,
          sourceStorageKey: `employee-imports/${winnerId}/source.xlsx`,
          templateVersion: 1,
          supersedesBatchId: staleId,
          committedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      });
    });
    try {
      await withBarrierTimeout(periodIsLocked, 'period holder acquired');
      const ensuring = snapshots.ensureBatch(staleId);
      await withBarrierTimeout(periodWaitIsStarted, 'ensure requested held period lock');
      releasePeriod();
      await withBarrierTimeout(supersede, 'winner superseded stale batch');

      await expect(
        withBarrierTimeout(ensuring, 'ensure observed current winner'),
      ).rejects.toMatchObject({
        code: 'EMPLOYEE_IMPORT_STATE_INVALID',
        statusCode: 409,
      });
    } finally {
      releasePeriod();
      await supersede.catch(() => undefined);
      snapshotLock.mockRestore();
      await holderPrisma.$disconnect();
    }
  });

  it('returns the concurrent READY winner when FAILED recovery waits on its batch lock', async () => {
    const { start: periodStart, end: periodEnd } = isolatedWeek();
    const batchId = randomUUID();
    batchIds.push(batchId);
    const batch = await prisma.employeeWorkImportBatch.create({
      data: {
        id: batchId,
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        version: 1,
        status: EmployeeWorkImportStatus.COMPLETED,
        snapshotStatus: EmployeeSnapshotStatus.NOT_STARTED,
        originalName: 'recovery-race.xlsx',
        fileHash: `recovery-race-${batchId}`,
        sourceStorageKey: `employee-imports/${batchId}/source.xlsx`,
        templateVersion: 1,
        committedAt: new Date(),
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });
    const snapshots = app.get(EmployeeProgressSnapshotService) as unknown as {
      markFailed: (revision: {
        id: string;
        status: EmployeeWorkImportStatus;
        snapshotStatus: EmployeeSnapshotStatus;
        updatedAt: Date;
        version: number | null;
        periodType: EmployeeProgressPeriod;
        periodStartAt: Date;
        periodEndAt: Date;
      }) => Promise<typeof batch | null>;
      lock: (tx: Prisma.TransactionClient, key: string) => Promise<void>;
    };
    const batchKey = `employee-import:${batchId}`;
    let winnerLocked!: () => void;
    let releaseWinner!: () => void;
    const winnerIsLocked = new Promise<void>((resolve) => {
      winnerLocked = resolve;
    });
    const releaseWinnerBarrier = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    const originalLock = snapshots.lock.bind(snapshots);
    let recoveryWaitStarted!: () => void;
    const recoveryWaitIsStarted = new Promise<void>((resolve) => {
      recoveryWaitStarted = resolve;
    });
    const snapshotLock = jest.spyOn(snapshots, 'lock').mockImplementation(async (tx, key) => {
      if (key === batchKey) recoveryWaitStarted();
      return originalLock(tx, key);
    });
    const holderPrisma = new PrismaClient();
    const winner = holderPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${batchKey}))`;
      winnerLocked();
      await releaseWinnerBarrier;
      return tx.employeeWorkImportBatch.update({
        where: { id: batchId },
        data: {
          snapshotStatus: EmployeeSnapshotStatus.READY,
          snapshotError: null,
        },
      });
    });

    try {
      await withBarrierTimeout(winnerIsLocked, 'READY winner acquired batch lock');
      const recovering = snapshots.markFailed({
        id: batch.id,
        status: batch.status,
        snapshotStatus: batch.snapshotStatus,
        updatedAt: batch.updatedAt,
        version: batch.version,
        periodType: batch.periodType,
        periodStartAt: batch.periodStartAt,
        periodEndAt: batch.periodEndAt,
      });
      await withBarrierTimeout(recoveryWaitIsStarted, 'FAILED recovery requested held batch lock');
      releaseWinner();
      await withBarrierTimeout(winner, 'READY winner committed');

      await expect(
        withBarrierTimeout(recovering, 'FAILED recovery read READY winner'),
      ).resolves.toMatchObject({
        id: batchId,
        status: EmployeeWorkImportStatus.COMPLETED,
        snapshotStatus: EmployeeSnapshotStatus.READY,
        snapshotError: null,
      });
    } finally {
      snapshotLock.mockRestore();
      releaseWinner();
      await winner.catch(() => undefined);
      await holderPrisma.$disconnect();
    }
  });

  it('keeps committed work when snapshot generation fails and recovers through HTTP rebuild', async () => {
    const periodStart = new Date(Date.UTC(2026, 9, 5));
    const periodEnd = new Date(Date.UTC(2026, 9, 11));
    const batchId = await uploadPreviewAndResolve(
      await workbookBuffer('snapshot-recovery', periodStart, periodEnd),
      'snapshot-recovery.xlsx',
    );
    const snapshots = app.get(EmployeeProgressSnapshotService) as unknown as {
      generateWeek: (...args: unknown[]) => Promise<unknown>;
    };
    const generation = jest
      .spyOn(snapshots, 'generateWeek')
      .mockRejectedValueOnce(new Error('private snapshot failure details'));

    let failedCommit!: request.Response;
    try {
      failedCommit = await request(app.getHttpServer())
        .post(`/api/employee-work-imports/${batchId}/commit`)
        .send({})
        .expect(201);
    } finally {
      generation.mockRestore();
    }

    expect(failedCommit.body.data).toMatchObject({
      id: batchId,
      status: EmployeeWorkImportStatus.COMPLETED,
      importedRows: 2,
      snapshotStatus: EmployeeSnapshotStatus.FAILED,
      snapshotError: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED',
      warning: { code: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED' },
    });
    expect(JSON.stringify(failedCommit.body)).not.toContain('private snapshot failure details');
    await expect(
      prisma.employeeWorkImportBatch.findUniqueOrThrow({
        where: { id: batchId },
        select: {
          status: true,
          snapshotStatus: true,
          snapshotError: true,
          importedRows: true,
        },
      }),
    ).resolves.toEqual({
      status: EmployeeWorkImportStatus.COMPLETED,
      snapshotStatus: EmployeeSnapshotStatus.FAILED,
      snapshotError: 'EMPLOYEE_SNAPSHOT_GENERATION_FAILED',
      importedRows: 2,
    });
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: batchId, archivedAt: null } }),
    ).resolves.toBe(2);
    await expect(
      prisma.resourceLoadEntry.count({
        where: { employeeWorkImportBatchId: batchId, archivedAt: null },
      }),
    ).resolves.toBe(1);

    await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${batchId}/rebuild-snapshots`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: batchId,
          status: EmployeeWorkImportStatus.COMPLETED,
          snapshotStatus: EmployeeSnapshotStatus.READY,
          snapshotError: null,
        });
        expect(body.data.warning).toBeUndefined();
      });
    await expect(
      prisma.employeeProgressSnapshot.findFirstOrThrow({
        where: {
          scopeKey: 'TEAM',
          periodType: EmployeeProgressPeriod.WEEK,
          periodStartAt: periodStart,
          archivedAt: null,
        },
        select: { sourceBatchIds: true, metrics: true },
      }),
    ).resolves.toMatchObject({
      sourceBatchIds: [batchId],
      metrics: {
        workItemCount: 2,
        projectCount: 1,
        unlinkedCount: 1,
        dataComplete: true,
      },
    });
  });

  it('resolves 50,000 staged rows within the transaction timeout', async () => {
    const rowCount = 50_000;
    const batchId = randomUUID();
    batchIds.push(batchId);
    await prisma.employeeWorkImportBatch.create({
      data: {
        id: batchId,
        periodType: 'WEEK',
        periodStartAt: new Date('2026-08-03T00:00:00.000Z'),
        periodEndAt: new Date('2026-08-09T00:00:00.000Z'),
        status: EmployeeWorkImportStatus.RESOLVING,
        originalName: 'capacity.xlsx',
        fileHash: 'capacity-file-hash',
        sourceStorageKey: `employee-imports/${batchId}/source.xlsx`,
        templateVersion: 1,
        previewFingerprint: 'capacity-preview-fingerprint',
        totalRows: rowCount,
        unresolvedRows: rowCount,
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });
    const insertChunkSize = 5_000;
    for (let offset = 0; offset < rowCount; offset += insertChunkSize) {
      await prisma.employeeWorkImportRow.createMany({
        data: Array.from({ length: Math.min(insertChunkSize, rowCount - offset) }, (_, index) => {
          const rowNumber = offset + index + 2;
          const rawValues = {
            员工姓名: employeeName,
            工作内容: `容量行 ${rowNumber}`,
            计划工时: 1,
          };
          return {
            id: randomUUID(),
            batchId,
            rowNumber,
            rawValues,
            normalizedValues: {
              rowNumber,
              employeeName,
              title: `容量行 ${rowNumber}`,
              planText: null,
              summaryText: null,
              completionRate: 0,
              status: EmployeeWorkStatus.NOT_STARTED,
              nextPlanText: null,
              riskText: null,
              plannedHours: 1,
              actualHours: null,
              projectCode: null,
              taskCode: null,
              note: null,
              rawValues,
            },
            status: EmployeeImportRowStatus.UNRESOLVED,
            errors: [],
            resolvedEmployeeId: employeeId,
            keepUnlinked: false,
          };
        }),
      });
    }

    const startedAt = performance.now();
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/resolutions`)
      .send({
        rows: Array.from({ length: rowCount }, (_, index) => ({
          rowNumber: index + 2,
          keepUnlinked: true,
        })),
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          status: EmployeeWorkImportStatus.READY,
          totalRows: rowCount,
          validRows: rowCount,
          unresolvedRows: 0,
        });
      });
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(120_000);
    await expect(
      prisma.employeeWorkImportRow.count({
        where: { batchId, status: EmployeeImportRowStatus.VALID },
      }),
    ).resolves.toBe(rowCount);
    const commitStartedAt = performance.now();
    await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${batchId}/commit`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          status: EmployeeWorkImportStatus.COMPLETED,
          importedRows: rowCount,
          snapshotStatus: EmployeeSnapshotStatus.READY,
        });
      });
    const commitElapsedMs = performance.now() - commitStartedAt;
    expect(commitElapsedMs).toBeLessThan(120_000);
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: batchId, archivedAt: null } }),
    ).resolves.toBe(rowCount);
    await expect(
      prisma.resourceLoadEntry.count({
        where: { employeeWorkImportBatchId: batchId, archivedAt: null },
      }),
    ).resolves.toBe(rowCount);
    await expect(
      prisma.resourceLoadEntry.findFirstOrThrow({
        where: { employeeWorkImportBatchId: batchId, archivedAt: null },
        select: { kind: true, employeeWorkItemId: true },
      }),
    ).resolves.toEqual({
      kind: LoadEntryKind.OTHER,
      employeeWorkItemId: expect.any(String),
    });
    await expect(
      prisma.employeeProgressSnapshot.findFirstOrThrow({
        where: {
          scopeKey: 'TEAM',
          periodType: EmployeeProgressPeriod.WEEK,
          periodStartAt: new Date('2026-08-03T00:00:00.000Z'),
          archivedAt: null,
        },
        select: { metrics: true, sourceBatchIds: true },
      }),
    ).resolves.toMatchObject({
      metrics: {
        workItemCount: rowCount,
        completedCount: 0,
        completionRate: 0,
        averageCompletionRate: 0,
        plannedHours: rowCount,
        actualHours: 0,
        riskCount: 0,
        blockedCount: 0,
        projectCount: 0,
        unlinkedCount: rowCount,
        dataComplete: true,
        missingWeeks: [],
      },
      sourceBatchIds: [batchId],
    });
    console.info(
      `employee import 50k resolution/commit elapsed: ${Math.round(elapsedMs)}ms/${Math.round(
        commitElapsedMs,
      )}ms`,
    );
  });
});
