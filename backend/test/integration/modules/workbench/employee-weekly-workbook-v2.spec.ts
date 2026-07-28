import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  EmployeeWorkSourceSection,
  PrismaClient,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Employee weekly workbook V2 integration', () => {
  jest.setTimeout(240_000);

  const DAY_MS = 86_400_000;
  const fixtureMarker = 'TEST-EMPLOYEE-WEEKLY-V2-';
  const suffix = randomUUID().slice(0, 8);
  const prefix = `${fixtureMarker}${suffix}`;
  const employeeName = `匿名周报-${suffix}`;
  const originalDepartment = `${prefix}-原部门`;
  const workbookDepartment = `${prefix}-新部门`;
  const originalWorkDirection = `${prefix}-原方向`;
  const workbookWorkDirection = `${prefix}-平台工程`;
  const projectCode = `${prefix}-PROJECT`;
  const taskCode = `${prefix}-TASK`;
  const weekOffset = Number.parseInt(suffix, 16) % 1_000;
  const periodStart = new Date(
    new Date('2040-01-02T00:00:00.000Z').getTime() + weekOffset * 7 * DAY_MS,
  );
  const nextPeriodStart = new Date(periodStart.getTime() + 7 * DAY_MS);
  const periodStartText = periodStart.toISOString().slice(0, 10);
  const nextPeriodStartText = nextPeriodStart.toISOString().slice(0, 10);
  const riskTitle = `${prefix}-项目风险工作`;
  const nonProjectTitle = `${prefix}-非项目工作`;
  const matchedPlanTitle = `${prefix}-项目计划`;
  const cancelledPlanTitle = `${prefix}-非项目计划`;
  const editedRiskText = `${prefix}-已确认风险`;

  const prisma = new PrismaClient();
  let app: INestApplication;
  let storage: StoragePort;
  let employeeId: string;
  let projectId: string;
  let taskId: string;

  function dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  async function fixtureBatchIds(): Promise<string[]> {
    const batches = await prisma.employeeWorkImportBatch.findMany({
      where: { originalName: { startsWith: fixtureMarker } },
      select: { id: true },
    });
    return batches.map(({ id }) => id);
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
        where: { department: { startsWith: fixtureMarker } },
        select: { id: true },
      }),
    ]);
    const batchIds = batches.map(({ id }) => id);
    const projectIds = projects.map(({ id }) => id);
    const employeeIds = employees.map(({ id }) => id);
    if (batchIds.length > 0) {
      await prisma.employeeWeekPlanItem.deleteMany({
        where: { importBatchId: { in: batchIds } },
      });
      await prisma.resourceLoadEntry.deleteMany({
        where: { employeeWorkImportBatchId: { in: batchIds } },
      });
      await prisma.employeeProgressSnapshot.deleteMany({
        where: { sourceBatchIds: { hasSome: batchIds } },
      });
      await prisma.employeeWorkItem.deleteMany({
        where: { importBatchId: { in: batchIds } },
      });
      await prisma.employeeWorkImportRow.deleteMany({
        where: { batchId: { in: batchIds } },
      });
      await prisma.employeeWorkImportBatch.deleteMany({
        where: { id: { in: batchIds } },
      });
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
      await prisma.risk.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    if (employeeIds.length > 0) {
      await prisma.resourceProfile.deleteMany({ where: { id: { in: employeeIds } } });
    }
    await Promise.all(
      batches.flatMap(({ sourceStorageKey, errorStorageKey }) => [
        storage.delete(sourceStorageKey).catch(() => undefined),
        ...(errorStorageKey ? [storage.delete(errorStorageKey).catch(() => undefined)] : []),
      ]),
    );
  }

  async function workbookBuffer(): Promise<Buffer> {
    const workbookService = app.get(EmployeeWorkbookService);
    const template = await workbookService.template({
      periodStart: periodStartText,
      employees: [
        {
          employeeName,
          department: workbookDepartment,
          workDirection: workbookWorkDirection,
        },
      ],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0], {
      ignoreNodes: ['dataValidations'],
    });
    const sheet = workbook.getWorksheet(employeeName);
    if (!sheet) throw new Error('Anonymous V2 employee worksheet is missing');

    sheet.getRow(7).values = [
      1,
      riskTitle,
      `${prefix}-风险交付`,
      new Date(periodStart.getTime() + 4 * DAY_MS),
      '有风险',
      0.6,
      `${prefix}-风险候选`,
      `${prefix}-风险后续`,
    ];
    sheet.getCell('F7').numFmt = '0%';
    sheet.getRow(8).values = [
      2,
      nonProjectTitle,
      `${prefix}-内部交付`,
      new Date(periodStart.getTime() + 5 * DAY_MS),
      '已完成',
      1,
      `${prefix}-内部成果`,
      `${prefix}-内部后续`,
    ];
    sheet.getCell('F8').numFmt = '0%';
    sheet.getRow(20).values = [
      1,
      matchedPlanTitle,
      `${prefix}-计划交付`,
      new Date(nextPeriodStart.getTime() + 3 * DAY_MS),
      '高',
      `${prefix}-需要测试协作`,
      `${prefix}-项目计划说明`,
      `${prefix}-项目计划备注`,
    ];
    sheet.getRow(21).values = [
      2,
      cancelledPlanTitle,
      `${prefix}-非项目计划交付`,
      new Date(nextPeriodStart.getTime() + 4 * DAY_MS),
      '中',
      `${prefix}-需要内部协作`,
      `${prefix}-非项目计划说明`,
      `${prefix}-非项目计划备注`,
    ];
    return Buffer.from(await workbook.xlsx.writeBuffer());
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
        displayName: employeeName,
        department: originalDepartment,
        workDirection: originalWorkDirection,
      },
    });
    employeeId = employee.id;
    const project = await prisma.project.create({
      data: { code: projectCode, name: `${prefix}-匿名项目` },
    });
    projectId = project.id;
    const task = await prisma.workTask.create({
      data: { code: taskCode, title: `${prefix}-匿名任务`, projectId },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    try {
      if (storage) await cleanupFixtures();
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        await app?.close();
      }
    }
  });

  it('imports, resolves, queries, acts on, and restores every V2 row kind', async () => {
    const source = await workbookBuffer();
    const uploaded = await request(app.getHttpServer())
      .post('/api/employee-work-imports')
      .attach('file', source, {
        filename: `${prefix}-weekly.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201);
    const batchId = uploaded.body.data.id as string;
    expect(uploaded.body.data).toMatchObject({
      id: batchId,
      templateVersion: 2,
      status: EmployeeWorkImportStatus.UPLOADED,
    });
    const storedBatch = await prisma.employeeWorkImportBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { sourceStorageKey: true },
    });
    await expect(
      storage.read(storedBatch.sourceStorageKey).then(({ content }) => content),
    ).resolves.toEqual(source);

    const previewed = await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/preview`)
      .send({})
      .expect(200);
    expect(previewed.body.data).toMatchObject({
      id: batchId,
      templateVersion: 2,
      status: EmployeeWorkImportStatus.RESOLVING,
      totalRows: 4,
      validRows: 0,
      unresolvedRows: 4,
    });
    expect(previewed.body.data.profileWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeName,
          field: 'department',
          profileValue: originalDepartment,
          rowValue: workbookDepartment,
        }),
        expect.objectContaining({
          employeeName,
          field: 'workDirection',
          profileValue: originalWorkDirection,
          rowValue: workbookWorkDirection,
        }),
      ]),
    );

    const staged = await request(app.getHttpServer())
      .get(`/api/employee-work-imports/${batchId}`)
      .query({ rowsPageSize: 20 })
      .expect(200);
    const stagedRows = staged.body.data.rows as Array<{
      id: string;
      normalizedValues: {
        title: string;
        sourceSection: 'CURRENT_WORK' | 'NEXT_WEEK_PLAN';
        sourceSheetName: string;
        sourceRowNumber: number;
      };
    }>;
    expect(stagedRows).toHaveLength(4);
    expect(
      stagedRows.map(({ normalizedValues }) => ({
        title: normalizedValues.title,
        section: normalizedValues.sourceSection,
        sheet: normalizedValues.sourceSheetName,
        row: normalizedValues.sourceRowNumber,
      })),
    ).toEqual([
      {
        title: riskTitle,
        section: EmployeeWorkSourceSection.CURRENT_WORK,
        sheet: employeeName,
        row: 7,
      },
      {
        title: nonProjectTitle,
        section: EmployeeWorkSourceSection.CURRENT_WORK,
        sheet: employeeName,
        row: 8,
      },
      {
        title: matchedPlanTitle,
        section: EmployeeWorkSourceSection.NEXT_WEEK_PLAN,
        sheet: employeeName,
        row: 20,
      },
      {
        title: cancelledPlanTitle,
        section: EmployeeWorkSourceSection.NEXT_WEEK_PLAN,
        sheet: employeeName,
        row: 21,
      },
    ]);
    const rowByTitle = new Map(stagedRows.map((row) => [row.normalizedValues.title, row] as const));

    const resolved = await request(app.getHttpServer())
      .patch(`/api/employee-work-imports/${batchId}/resolutions`)
      .send({
        rows: [
          {
            rowId: rowByTitle.get(riskTitle)!.id,
            employeeId,
            updateEmployeeProfile: true,
            workKind: EmployeeWorkKind.PROJECT,
            projectId,
            taskId,
            plannedHours: 12,
            actualHours: 9,
            riskDecision: 'EDIT',
            riskText: editedRiskText,
          },
          {
            rowId: rowByTitle.get(nonProjectTitle)!.id,
            employeeId,
            workKind: EmployeeWorkKind.NON_PROJECT,
            plannedHours: 4,
            actualHours: 3,
            riskDecision: 'REMOVE',
          },
          {
            rowId: rowByTitle.get(matchedPlanTitle)!.id,
            employeeId,
            workKind: EmployeeWorkKind.PROJECT,
            projectId,
            taskId,
            plannedHours: 6,
          },
          {
            rowId: rowByTitle.get(cancelledPlanTitle)!.id,
            employeeId,
            workKind: EmployeeWorkKind.NON_PROJECT,
            plannedHours: 2,
          },
        ],
      });
    if (resolved.status !== 200) {
      throw new Error(`V2 rowId resolution failed: ${JSON.stringify(resolved.body)}`);
    }
    expect(resolved.body.data).toMatchObject({
      id: batchId,
      status: EmployeeWorkImportStatus.READY,
      validRows: 4,
      unresolvedRows: 0,
    });

    const committed = await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${batchId}/commit`)
      .send({});
    if (committed.status !== 201) {
      throw new Error(`V2 commit failed: ${JSON.stringify(committed.body)}`);
    }
    const committedVersion = committed.body.data.version as number;
    expect(committed.body.data).toMatchObject({
      id: batchId,
      status: EmployeeWorkImportStatus.COMPLETED,
      importedRows: 4,
      version: expect.any(Number),
    });

    const [workItems, weekPlans, employee] = await Promise.all([
      prisma.employeeWorkItem.findMany({
        where: { importBatchId: batchId, archivedAt: null },
        include: { sourceRow: true },
        orderBy: { title: 'asc' },
      }),
      prisma.employeeWeekPlanItem.findMany({
        where: { importBatchId: batchId, archivedAt: null },
        include: { sourceRow: true },
        orderBy: { title: 'asc' },
      }),
      prisma.resourceProfile.findUniqueOrThrow({ where: { id: employeeId } }),
    ]);
    expect(workItems).toHaveLength(2);
    expect(weekPlans).toHaveLength(2);
    expect(employee).toMatchObject({
      department: workbookDepartment,
      workDirection: workbookWorkDirection,
    });
    expect(workItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: riskTitle,
          workKind: EmployeeWorkKind.PROJECT,
          projectId,
          taskId,
          plannedHours: expect.objectContaining({}),
          actualHours: expect.objectContaining({}),
          riskText: editedRiskText,
          plannedCompletionAt: new Date(periodStart.getTime() + 4 * DAY_MS),
          sourceRow: expect.objectContaining({
            sourceSheetName: employeeName,
            sourceSection: EmployeeWorkSourceSection.CURRENT_WORK,
            sourceRowNumber: 7,
            sourceKey: `${employeeName}:CURRENT_WORK:7`,
          }),
        }),
        expect.objectContaining({
          title: nonProjectTitle,
          workKind: EmployeeWorkKind.NON_PROJECT,
          projectId: null,
          taskId: null,
          riskText: null,
          sourceRow: expect.objectContaining({
            sourceSheetName: employeeName,
            sourceSection: EmployeeWorkSourceSection.CURRENT_WORK,
            sourceRowNumber: 8,
          }),
        }),
      ]),
    );
    expect(Number(workItems.find(({ title }) => title === riskTitle)!.plannedHours)).toBe(12);
    expect(Number(workItems.find(({ title }) => title === riskTitle)!.actualHours)).toBe(9);
    expect(Number(workItems.find(({ title }) => title === nonProjectTitle)!.plannedHours)).toBe(4);
    expect(Number(workItems.find(({ title }) => title === nonProjectTitle)!.actualHours)).toBe(3);
    expect(weekPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: matchedPlanTitle,
          priority: EmployeePlanPriority.HIGH,
          workKind: EmployeeWorkKind.PROJECT,
          projectId,
          taskId,
          periodStartAt: nextPeriodStart,
          deliverableText: `${prefix}-计划交付`,
          collaborationText: `${prefix}-需要测试协作`,
          planText: `${prefix}-项目计划说明`,
          note: `${prefix}-项目计划备注`,
          sourceRow: expect.objectContaining({
            sourceSheetName: employeeName,
            sourceSection: EmployeeWorkSourceSection.NEXT_WEEK_PLAN,
            sourceRowNumber: 20,
            sourceKey: `${employeeName}:NEXT_WEEK_PLAN:20`,
          }),
        }),
        expect.objectContaining({
          title: cancelledPlanTitle,
          priority: EmployeePlanPriority.MEDIUM,
          workKind: EmployeeWorkKind.NON_PROJECT,
          projectId: null,
          taskId: null,
          sourceRow: expect.objectContaining({
            sourceSheetName: employeeName,
            sourceSection: EmployeeWorkSourceSection.NEXT_WEEK_PLAN,
            sourceRowNumber: 21,
          }),
        }),
      ]),
    );

    const currentQuery = await request(app.getHttpServer())
      .get('/api/employee-work-items')
      .query({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: periodStartText,
        employeeId,
      })
      .expect(200);
    expect(currentQuery.body.data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: riskTitle,
          workDirection: workbookWorkDirection,
          workKind: EmployeeWorkKind.PROJECT,
          plannedHours: 12,
          actualHours: 9,
          riskText: editedRiskText,
          source: {
            sheetName: employeeName,
            section: EmployeeWorkSourceSection.CURRENT_WORK,
            rowNumber: 7,
            key: `${employeeName}:CURRENT_WORK:7`,
            label: `${employeeName} / 本周工作 / 第 7 行`,
          },
        }),
        expect.objectContaining({
          title: nonProjectTitle,
          workKind: EmployeeWorkKind.NON_PROJECT,
          project: null,
          task: null,
        }),
      ]),
    );

    const planQuery = await request(app.getHttpServer())
      .get('/api/employee-week-plans')
      .query({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: nextPeriodStartText,
        employeeId,
      })
      .expect(200);
    expect(planQuery.body.data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: matchedPlanTitle,
          workDirection: workbookWorkDirection,
          priority: EmployeePlanPriority.HIGH,
          workKind: EmployeeWorkKind.PROJECT,
          source: {
            sheetName: employeeName,
            section: EmployeeWorkSourceSection.NEXT_WEEK_PLAN,
            rowNumber: 20,
            key: `${employeeName}:NEXT_WEEK_PLAN:20`,
            label: `${employeeName} / 下周计划 / 第 20 行`,
          },
        }),
        expect.objectContaining({
          title: cancelledPlanTitle,
          workKind: EmployeeWorkKind.NON_PROJECT,
        }),
      ]),
    );

    const workItemByTitle = new Map(workItems.map((item) => [item.title, item] as const));
    const weekPlanByTitle = new Map(weekPlans.map((item) => [item.title, item] as const));
    const matchedPlan = weekPlanByTitle.get(matchedPlanTitle)!;
    const cancelledPlan = weekPlanByTitle.get(cancelledPlanTitle)!;
    for (const alreadyMatched of [false, true]) {
      await request(app.getHttpServer())
        .post(`/api/employee-week-plans/${matchedPlan.id}/match`)
        .send({ workItemId: workItemByTitle.get(riskTitle)!.id })
        .expect(201)
        .expect(({ body }) => {
          expect(body.data).toMatchObject({
            alreadyMatched,
            plan: {
              id: matchedPlan.id,
              carryStatus: EmployeePlanCarryStatus.MATCHED,
              matchedWorkItemId: workItemByTitle.get(riskTitle)!.id,
            },
          });
        });
    }
    for (const alreadyCancelled of [false, true]) {
      await request(app.getHttpServer())
        .post(`/api/employee-week-plans/${cancelledPlan.id}/cancel`)
        .send({ reason: alreadyCancelled ? `${prefix}-第二次取消` : `${prefix}-首次取消` })
        .expect(201)
        .expect(({ body }) => {
          expect(body.data).toMatchObject({
            alreadyCancelled,
            plan: {
              id: cancelledPlan.id,
              carryStatus: EmployeePlanCarryStatus.CANCELLED,
              cancelReason: `${prefix}-首次取消`,
            },
          });
        });
    }

    const restored = await request(app.getHttpServer())
      .post(`/api/employee-work-imports/${batchId}/restore`)
      .send({});
    if (restored.status !== 201) {
      throw new Error(`V2 restore failed: ${JSON.stringify(restored.body)}`);
    }
    const restoredBatchId = restored.body.data.id as string;
    expect(restored.body.data).toMatchObject({
      id: restoredBatchId,
      status: EmployeeWorkImportStatus.COMPLETED,
      version: committedVersion + 1,
      restoredFromBatchId: batchId,
      importedRows: 4,
    });
    expect(await fixtureBatchIds()).toEqual(expect.arrayContaining([batchId, restoredBatchId]));

    const [restoredWorkItems, restoredWeekPlans, restoredRows] = await Promise.all([
      prisma.employeeWorkItem.findMany({
        where: { importBatchId: restoredBatchId, archivedAt: null },
        include: { sourceRow: true },
      }),
      prisma.employeeWeekPlanItem.findMany({
        where: { importBatchId: restoredBatchId, archivedAt: null },
        include: { sourceRow: true },
      }),
      prisma.employeeWorkImportRow.findMany({
        where: { batchId: restoredBatchId },
        orderBy: { rowNumber: 'asc' },
      }),
    ]);
    expect(restoredWorkItems).toHaveLength(2);
    expect(restoredWeekPlans).toHaveLength(2);
    expect(restoredRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSheetName: employeeName,
          sourceSection: EmployeeWorkSourceSection.CURRENT_WORK,
          sourceRowNumber: 7,
          workKind: EmployeeWorkKind.PROJECT,
          plannedHours: expect.objectContaining({}),
          actualHours: expect.objectContaining({}),
          riskDecision: 'EDIT',
          riskText: editedRiskText,
        }),
        expect.objectContaining({
          sourceSheetName: employeeName,
          sourceSection: EmployeeWorkSourceSection.NEXT_WEEK_PLAN,
          sourceRowNumber: 20,
          workKind: EmployeeWorkKind.PROJECT,
          plannedHours: expect.objectContaining({}),
        }),
      ]),
    );
    expect(restoredWorkItems.find(({ title }) => title === riskTitle)).toEqual(
      expect.objectContaining({
        workKind: EmployeeWorkKind.PROJECT,
        projectId,
        taskId,
        riskText: editedRiskText,
        sourceRow: expect.objectContaining({
          sourceSheetName: employeeName,
          sourceSection: EmployeeWorkSourceSection.CURRENT_WORK,
          sourceRowNumber: 7,
        }),
      }),
    );
    expect(restoredWeekPlans.find(({ title }) => title === matchedPlanTitle)).toEqual(
      expect.objectContaining({
        deliverableText: `${prefix}-计划交付`,
        priority: EmployeePlanPriority.HIGH,
        collaborationText: `${prefix}-需要测试协作`,
        planText: `${prefix}-项目计划说明`,
        note: `${prefix}-项目计划备注`,
        workKind: EmployeeWorkKind.PROJECT,
        projectId,
        taskId,
        carryStatus: EmployeePlanCarryStatus.PLANNED,
        sourceRow: expect.objectContaining({
          sourceSheetName: employeeName,
          sourceSection: EmployeeWorkSourceSection.NEXT_WEEK_PLAN,
          sourceRowNumber: 20,
        }),
      }),
    );
    expect(dateOnly(restoredWorkItems[0].periodStartAt)).toBe(periodStartText);
    expect(dateOnly(restoredWeekPlans[0].periodStartAt)).toBe(nextPeriodStartText);
  });
});
