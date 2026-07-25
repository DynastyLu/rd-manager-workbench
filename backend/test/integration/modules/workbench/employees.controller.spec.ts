import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  EmployeeWorkImportStatus,
  EmploymentStatus,
  LoadEntryKind,
  PrismaClient,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Employees API', () => {
  jest.setTimeout(120_000);

  const DAY_MS = 86_400_000;
  const prefix = `TEST-EMPLOYEES-${Date.now()}`;
  const primaryName = `${prefix}-研发主管`;
  const secondaryName = `${prefix}-平台工程师`;
  const prisma = new PrismaClient();
  const importBatchIds: string[] = [];
  let app: INestApplication;

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
  });

  afterAll(async () => {
    try {
      if (importBatchIds.length > 0) {
        const batches = await prisma.employeeWorkImportBatch.findMany({
          where: { id: { in: importBatchIds } },
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
          where: { employeeWorkImportBatchId: { in: importBatchIds } },
        });
        await prisma.employeeProgressSnapshot.deleteMany({
          where: { sourceBatchIds: { hasSome: importBatchIds } },
        });
        await prisma.employeeWorkItem.deleteMany({
          where: { importBatchId: { in: importBatchIds } },
        });
        await prisma.employeeWorkImportRow.deleteMany({
          where: { batchId: { in: importBatchIds } },
        });
        await prisma.employeeWorkImportBatch.deleteMany({
          where: { id: { in: importBatchIds } },
        });
      }
      const employees = await prisma.resourceProfile.findMany({
        where: { displayName: { startsWith: prefix } },
        select: { id: true },
      });
      const employeeIds = employees.map(({ id }) => id);
      if (employeeIds.length > 0) {
        await prisma.resourceLoadEntry.deleteMany({
          where: { resourceId: { in: employeeIds } },
        });
        await prisma.resourceProfile.deleteMany({
          where: { id: { in: employeeIds } },
        });
      }
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        await app?.close();
      }
    }
  });

  async function importWorkbookBuffer(
    employeeName: string,
    periodStart: Date,
    periodEnd: Date,
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
      '实现员工周报导入',
      '完成接口设计',
      '完成开发',
      90,
      '进行中',
      '联调',
      null,
      8,
      7,
      null,
      null,
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

  async function commitImportWithPlannedHours(employeeName: string): Promise<string> {
    // Isolated far-future week so the commit never supersedes other specs' batches.
    const runOffset = Date.now() % 500;
    const periodStart = new Date(Date.UTC(2030, 0, 7) + runOffset * 7 * DAY_MS);
    const periodEnd = new Date(periodStart.getTime() + 6 * DAY_MS);
    const source = await importWorkbookBuffer(employeeName, periodStart, periodEnd);
    const uploaded = await request(app.getHttpServer())
      .post('/api/employee-work-imports')
      .attach('file', source, {
        filename: 'archive-import-owned.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201);
    const batchId = uploaded.body.data.id as string;
    importBatchIds.push(batchId);
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/preview`)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/resolutions`)
      .send({
        rows: [{ rowNumber: 3, projectId: null, taskId: null, keepUnlinked: true }],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.status).toBe(EmployeeWorkImportStatus.READY);
      });
    await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${batchId}/commit`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.status).toBe(EmployeeWorkImportStatus.COMPLETED);
      });
    return batchId;
  }

  it('creates, filters, searches, retrieves, updates, and archives employee profiles', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/employees')
      .send({
        displayName: ` ${primaryName} `,
        department: ' 研发部 ',
        roleTitle: ' 研发负责人 ',
        managerName: ' 技术总监 ',
        employmentStatus: EmploymentStatus.ACTIVE,
        weeklyCapacityHours: '40',
        developmentGoal: ' 建设研发体系 ',
        notes: ' 核心岗位 ',
      })
      .expect(201);
    const employeeId = created.body.data.id as string;

    expect(created.body).toMatchObject({
      success: true,
      data: {
        id: employeeId,
        displayName: primaryName,
        department: '研发部',
        roleTitle: '研发负责人',
        managerName: '技术总监',
        employmentStatus: EmploymentStatus.ACTIVE,
        weeklyCapacityHours: 40,
        developmentGoal: '建设研发体系',
        notes: '核心岗位',
        skills: [],
      },
    });

    await request(app.getHttpServer())
      .post('/api/employees')
      .send({
        displayName: secondaryName,
        department: '平台部',
        roleTitle: '基础设施工程师',
        employmentStatus: EmploymentStatus.ON_LEAVE,
      })
      .expect(201);

    const filtered = await request(app.getHttpServer())
      .get('/api/employees')
      .query({
        q: ` ${prefix} `,
        department: ' 研发部 ',
        employmentStatus: EmploymentStatus.ACTIVE,
        page: '1',
        pageSize: '1',
      })
      .expect(200);

    expect(filtered.body).toMatchObject({
      success: true,
      data: {
        data: [
          expect.objectContaining({
            id: employeeId,
            displayName: primaryName,
            skills: [],
          }),
        ],
        meta: { page: 1, pageSize: 1, total: 1 },
      },
    });

    const searchedByRole = await request(app.getHttpServer())
      .get('/api/employees')
      .query({ q: '基础设施', employmentStatus: EmploymentStatus.ON_LEAVE })
      .expect(200);
    expect(searchedByRole.body.data.data).toEqual([
      expect.objectContaining({ displayName: secondaryName, department: '平台部' }),
    ]);

    const retrieved = await request(app.getHttpServer())
      .get(`/api/employees/${employeeId}`)
      .expect(200);
    expect(retrieved.body.data).toMatchObject({
      id: employeeId,
      skills: [],
      loadEntries: [],
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/employees/${employeeId}`)
      .send({
        displayName: ` ${prefix}-更新后主管 `,
        managerName: ' 新任总监 ',
        employmentStatus: EmploymentStatus.LEFT,
        weeklyCapacityHours: 32,
      })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      id: employeeId,
      displayName: `${prefix}-更新后主管`,
      managerName: '新任总监',
      employmentStatus: EmploymentStatus.LEFT,
      weeklyCapacityHours: 32,
      skills: [],
    });

    await request(app.getHttpServer()).delete(`/api/employees/${employeeId}`).expect(204);

    const afterArchive = await request(app.getHttpServer())
      .get('/api/employees')
      .query({ q: prefix })
      .expect(200);
    expect(afterArchive.body.data.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: employeeId })]),
    );
    const archived = await request(app.getHttpServer())
      .get(`/api/employees/${employeeId}`)
      .expect(404);
    expect(archived.body).toMatchObject({
      success: false,
      error: { code: 'RESOURCE_NOT_FOUND', message: 'Employee not found' },
    });
    const archivedUpdate = await request(app.getHttpServer())
      .patch(`/api/employees/${employeeId}`)
      .send({ roleTitle: '不应更新' })
      .expect(404);
    expect(archivedUpdate.body).toMatchObject({
      success: false,
      error: { code: 'RESOURCE_NOT_FOUND' },
    });
  });

  it('rejects invalid capacity and unknown fields', async () => {
    const invalidCapacity = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: `${prefix}-INVALID-CAPACITY`, weeklyCapacityHours: 169 })
      .expect(400);
    expect(invalidCapacity.body).toMatchObject({
      success: false,
      error: { code: 'HTTP_ERROR' },
    });

    const unknownField = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: `${prefix}-UNKNOWN`, unexpected: true })
      .expect(400);
    expect(unknownField.body).toMatchObject({
      success: false,
      error: { code: 'HTTP_ERROR' },
    });
  });

  it('rejects unsafe employee pagination values', async () => {
    const oversizedPage = await request(app.getHttpServer())
      .get('/api/employees')
      .query({ page: 1_000_001 })
      .expect(400);
    expect(oversizedPage.body).toMatchObject({
      success: false,
      error: { code: 'HTTP_ERROR' },
    });

    const oversizedPageSize = await request(app.getHttpServer())
      .get('/api/employees')
      .query({ pageSize: 101 })
      .expect(400);
    expect(oversizedPageSize.body).toMatchObject({
      success: false,
      error: { code: 'HTTP_ERROR' },
    });
  });

  it('rejects null or blank numeric, enum, and required employee values', async () => {
    const [nullCapacity, blankCapacity, nullStatus] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/employees')
        .send({ displayName: `${prefix}-NULL-CAPACITY`, weeklyCapacityHours: null }),
      request(app.getHttpServer())
        .post('/api/employees')
        .send({ displayName: `${prefix}-BLANK-CAPACITY`, weeklyCapacityHours: '' }),
      request(app.getHttpServer())
        .post('/api/employees')
        .send({ displayName: `${prefix}-NULL-STATUS`, employmentStatus: null }),
    ]);
    expect([nullCapacity.status, blankCapacity.status, nullStatus.status]).toEqual([400, 400, 400]);
    for (const response of [nullCapacity, blankCapacity, nullStatus]) {
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'HTTP_ERROR' },
      });
    }

    const employee = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: `${prefix}-NULL-NAME-TARGET` })
      .expect(201);
    const nullName = await request(app.getHttpServer())
      .patch(`/api/employees/${employee.body.data.id}`)
      .send({ displayName: null })
      .expect(400);
    expect(nullName.body).toMatchObject({
      success: false,
      error: { code: 'HTTP_ERROR' },
    });
  });

  it('returns RESOURCE_NAME_EXISTS for duplicate display names on create and update', async () => {
    const duplicateName = `${prefix}-DUPLICATE`;
    const first = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: duplicateName })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: duplicateName })
      .expect(409);
    expect(duplicate.body).toMatchObject({
      success: false,
      error: { code: 'RESOURCE_NAME_EXISTS', message: 'Employee name already exists' },
    });

    const second = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: `${prefix}-DUPLICATE-UPDATE` })
      .expect(201);
    const duplicateUpdate = await request(app.getHttpServer())
      .patch(`/api/employees/${second.body.data.id}`)
      .send({ displayName: first.body.data.displayName })
      .expect(409);
    expect(duplicateUpdate.body).toMatchObject({
      success: false,
      error: { code: 'RESOURCE_NAME_EXISTS', message: 'Employee name already exists' },
    });
    const unchanged = await request(app.getHttpServer())
      .get(`/api/employees/${second.body.data.id}`)
      .expect(200);
    expect(unchanged.body.data.displayName).toBe(`${prefix}-DUPLICATE-UPDATE`);
  });

  it('blocks employee archival until active resource load entries are archived', async () => {
    const employee = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: `${prefix}-ACTIVE-LOAD` })
      .expect(201);
    const employeeId = employee.body.data.id as string;
    const loadEntry = await request(app.getHttpServer())
      .post(`/api/resources/${employeeId}/load-entries`)
      .send({
        weekStartAt: '2026-07-20',
        kind: LoadEntryKind.OTHER,
        plannedHours: 8,
      })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .delete(`/api/employees/${employeeId}`)
      .expect(422);
    expect(blocked.body).toMatchObject({
      success: false,
      error: {
        code: 'RESOURCE_LOAD_REFERENCE_INVALID',
        message: 'Archive load entries before archiving employee',
      },
    });
    await request(app.getHttpServer()).get(`/api/employees/${employeeId}`).expect(200);

    await request(app.getHttpServer())
      .delete(`/api/resources/${employeeId}/load-entries/${loadEntry.body.data.id}`)
      .expect(204);
    await request(app.getHttpServer()).delete(`/api/employees/${employeeId}`).expect(204);
  });

  it('archives an employee whose only active load entries are import-owned', async () => {
    const employee = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ displayName: `${prefix}-IMPORT-OWNED-LOAD` })
      .expect(201);
    const employeeId = employee.body.data.id as string;
    const employeeName = employee.body.data.displayName as string;

    const batchId = await commitImportWithPlannedHours(employeeName);
    const importLoadEntries = await prisma.resourceLoadEntry.findMany({
      where: { resourceId: employeeId, archivedAt: null },
    });
    expect(importLoadEntries).toHaveLength(1);
    expect(importLoadEntries[0].employeeWorkItemId).not.toBeNull();
    expect(Number(importLoadEntries[0].plannedHours)).toBe(8);

    await request(app.getHttpServer()).delete(`/api/employees/${employeeId}`).expect(204);
    await request(app.getHttpServer()).get(`/api/employees/${employeeId}`).expect(404);

    // Historical import data is preserved untouched by the archive.
    const preservedLoadEntries = await prisma.resourceLoadEntry.findMany({
      where: { resourceId: employeeId },
    });
    expect(preservedLoadEntries).toHaveLength(1);
    expect(preservedLoadEntries[0].archivedAt).toBeNull();
    await expect(
      prisma.employeeWorkItem.count({ where: { importBatchId: batchId, archivedAt: null } }),
    ).resolves.toBe(2);
  });

  it('returns RESOURCE_NOT_FOUND for unknown employee IDs', async () => {
    const missingId = 'missing-employee-id';
    const retrieved = await request(app.getHttpServer())
      .get(`/api/employees/${missingId}`)
      .expect(404);
    expect(retrieved.body).toMatchObject({
      success: false,
      error: { code: 'RESOURCE_NOT_FOUND' },
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/employees/${missingId}`)
      .send({ roleTitle: '不存在' })
      .expect(404);
    expect(updated.body).toMatchObject({
      success: false,
      error: { code: 'RESOURCE_NOT_FOUND' },
    });

    const deleted = await request(app.getHttpServer())
      .delete(`/api/employees/${missingId}`)
      .expect(404);
    expect(deleted.body).toMatchObject({
      success: false,
      error: { code: 'RESOURCE_NOT_FOUND' },
    });
  });
});
