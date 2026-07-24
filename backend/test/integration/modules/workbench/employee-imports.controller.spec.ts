import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  EmployeeImportRowStatus,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  PrismaClient,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Employee work imports API', () => {
  jest.setTimeout(240_000);

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

  async function workbookBuffer(): Promise<Buffer> {
    const template = await new EmployeeWorkbookService().template();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0], {
      ignoreNodes: ['dataValidations'],
    });
    const instructions = workbook.getWorksheet('说明');
    const details = workbook.getWorksheet('工作明细');
    if (!instructions || !details) throw new Error('Employee workbook sheets are missing');
    instructions.getCell('B4').value = new Date(Date.UTC(2026, 6, 20));
    instructions.getCell('B5').value = new Date(Date.UTC(2026, 6, 26));
    details.addRow([
      employeeName,
      '实现员工周报导入',
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
    expect(concurrentUpload.body.data.id).toBe(batchId);
    expect(uploaded.body.data).toMatchObject({
      id: batchId,
      status: EmployeeWorkImportStatus.UPLOADED,
      originalName: 'weekly.xlsx',
      hasErrors: false,
    });
    expect(uploaded.body.data).not.toHaveProperty('sourceStorageKey');

    const duplicate = await request(app.getHttpServer())
      .post('/api/employee-work-imports')
      .attach('file', source, {
        filename: 'duplicate.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201);
    expect(duplicate.body.data.id).toBe(batchId);

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
              plannedHours: null,
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
    console.info(`employee import 50k resolution elapsed: ${Math.round(elapsedMs)}ms`);
  });
});
