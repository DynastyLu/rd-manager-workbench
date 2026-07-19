import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataFieldType, DataTableSource, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Multi-dimensional base API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-BASE-${Date.now()}`;
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
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
    const workspaces = await prisma.dataWorkspace.findMany({
      where: { name: { startsWith: prefix } },
      select: { id: true },
    });
    const workspaceIds = workspaces.map(({ id }) => id);
    const tables = await prisma.dataTable.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true },
    });
    const tableIds = tables.map(({ id }) => id);
    await prisma.dataRecord.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.dataView.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.dataField.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.dataTable.deleteMany({ where: { id: { in: tableIds } } });
    await prisma.dataWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.risk.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.decision.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.meetingAction.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.meeting.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('creates the default workspace and five presets idempotently under concurrency', async () => {
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer()).get('/api/base/workspaces').expect(200),
      ),
    );
    for (const response of responses) {
      const workspace = response.body.data.find(
        (item: { name: string }) => item.name === '研发工作台',
      );
      expect(workspace.tables).toHaveLength(5);
      expect(workspace.tables.map((table: { source: string }) => table.source)).toEqual(
        expect.arrayContaining([
          'PROJECTS',
          'WORK_TASKS',
          'MEETING_ACTIONS',
          'DOCUMENTS',
          'RISKS_DECISIONS',
        ]),
      );
    }
    await expect(
      prisma.dataWorkspace.count({ where: { id: 'rd-workbench-default-data-workspace' } }),
    ).resolves.toBe(1);
    await expect(prisma.dataTable.count({ where: { presetKey: { not: null } } })).resolves.toBe(5);

    const meetingTable = responses[0].body.data[0].tables.find(
      (table: { source: string }) => table.source === 'MEETING_ACTIONS',
    );
    const meetingFields = Object.fromEntries(
      meetingTable.fields.map((field: { key: string }) => [field.key, field]),
    );
    expect(meetingFields.status.config).toMatchObject({
      optionsByRecordType: {
        MEETING: expect.arrayContaining(['PLANNED', 'HELD', 'CANCELLED']),
        ACTION: expect.arrayContaining(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
      },
    });
    expect(meetingFields.recordType.config.readOnly).toBe(true);
    expect(meetingFields.meetingTitle.config.readOnly).toBe(true);
    expect(meetingFields.taskId.config.readOnly).toBe(true);
    expect(meetingFields.ownerName.config.readOnlyRecordTypes).toEqual(['MEETING']);

    const governanceTable = responses[0].body.data[0].tables.find(
      (table: { source: string }) => table.source === 'RISKS_DECISIONS',
    );
    const governanceFields = Object.fromEntries(
      governanceTable.fields.map((field: { key: string }) => [field.key, field]),
    );
    expect(governanceFields.status.config.optionsByRecordType).toMatchObject({
      RISK: expect.arrayContaining(['OPEN', 'MITIGATING', 'CLOSED']),
      DECISION: expect.arrayContaining(['DRAFT', 'DECIDED', 'SUPERSEDED']),
    });
    expect(governanceFields.recordType.config.readOnly).toBe(true);
    expect(governanceFields.level.config.readOnlyRecordTypes).toEqual(['DECISION']);

    const documentTable = responses[0].body.data[0].tables.find(
      (table: { source: string }) => table.source === 'DOCUMENTS',
    );
    expect(
      documentTable.fields.find((field: { key: string }) => field.key === 'type').config.readOnly,
    ).toBe(true);
  });

  it('supports custom table, field, record and view CRUD with field validation', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 工作区` })
      .expect(201);
    const table = await request(app.getHttpServer())
      .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
      .send({ name: `${prefix} 需求池` })
      .expect(201);
    const tableId = table.body.data.id as string;
    const numberField = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({ key: 'estimate', name: '工时', type: 'NUMBER', isRequired: true, sequence: 1 })
      .expect(201);
    const stageField = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({
        key: 'stage',
        name: '阶段',
        type: 'SINGLE_SELECT',
        config: {
          options: [
            { label: '计划', value: 'PLANNED' },
            { label: '完成', value: 'DONE' },
          ],
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({
        key: 'labels',
        name: '标签',
        type: 'MULTI_SELECT',
        isRequired: true,
        config: { options: [{ label: '后端', value: 'backend' }] },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({ key: 'referenceUrl', name: '链接', type: 'LINK' })
      .expect(201);
    const primary = table.body.data.fields.find((field: { isPrimary: boolean }) => field.isPrimary);
    await request(app.getHttpServer())
      .patch(`/api/base/fields/${primary.id}`)
      .send({ isPrimary: false })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/base/tables/${tableId}/records`)
      .query({ sortOrder: 'sideways' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/records`)
      .send({ values: { title: '任务 A', estimate: 'three', labels: ['backend'] } })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/records`)
      .send({ values: { title: '任务 A', estimate: 3, labels: ['backend'], unexpected: true } })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/records`)
      .send({ values: { title: '任务 A', estimate: 3, stage: 'UNKNOWN', labels: ['backend'] } })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/records`)
      .send({ values: { title: '任务 A', estimate: 3, stage: 'PLANNED', labels: [1] } })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/records`)
      .send({ values: { title: '任务 A', estimate: 3, stage: 'PLANNED', labels: [] } })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/records`)
      .send({
        values: {
          title: '任务 A',
          estimate: 3,
          stage: 'PLANNED',
          labels: ['backend'],
          referenceUrl: 'not-a-url',
        },
      })
      .expect(400);
    const record = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/records`)
      .send({
        values: {
          title: '任务 A',
          estimate: 3,
          stage: 'PLANNED',
          labels: ['backend'],
          referenceUrl: 'https://example.com/spec',
        },
      })
      .expect(201);
    expect(record.body.data).toMatchObject({
      values: { title: '任务 A', estimate: 3, stage: 'PLANNED', labels: ['backend'] },
      sourceType: 'CUSTOM',
    });

    await request(app.getHttpServer())
      .patch(`/api/base/tables/${tableId}/records/${record.body.data.id}`)
      .send({ values: { estimate: 5 } })
      .expect(200);
    const view = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({ name: '工时看板', type: 'KANBAN', config: { groupField: 'estimate' } })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/base/views/${view.body.data.id}`)
      .send({ name: '排期看板', isDefault: true })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/base/fields/${numberField.body.data.id}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/base/tables/${tableId}/records`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.data[0].values).toMatchObject({
          title: '任务 A',
          stage: 'PLANNED',
          labels: ['backend'],
        }),
      );
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({ key: 'estimate', name: '恢复工时', type: 'NUMBER', isRequired: true, sequence: 1 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: numberField.body.data.id, archivedAt: null });
      });
    await request(app.getHttpServer())
      .delete(`/api/base/fields/${stageField.body.data.id}`)
      .expect(204);
    await request(app.getHttpServer()).delete(`/api/base/views/${view.body.data.id}`).expect(204);
  });

  it('validates computed field configs and previews formulas without persisting preview data', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 计算字段工作区` })
      .expect(201);
    const sourceTable = await request(app.getHttpServer())
      .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
      .send({ name: `${prefix} 计算源表` })
      .expect(201);
    const targetTable = await request(app.getHttpServer())
      .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
      .send({ name: `${prefix} 关系目标表` })
      .expect(201);
    const sourceTableId = sourceTable.body.data.id as string;
    const targetTableId = targetTable.body.data.id as string;
    const amount = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({ key: 'amount', name: '金额', type: DataFieldType.NUMBER })
      .expect(201);
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'project',
        name: '项目',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: false, relationMode: 'ONE_WAY' },
      })
      .expect(201);
    const targetTitle = targetTable.body.data.fields.find(
      (field: { key: string }) => field.key === 'title',
    );
    const lookup = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'projectTitle',
        name: '项目名称',
        type: DataFieldType.LOOKUP,
        config: { relationFieldId: relation.body.data.id, targetFieldId: targetTitle.id },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'projectCount',
        name: '项目数量',
        type: DataFieldType.ROLLUP,
        config: { relationFieldId: relation.body.data.id, aggregation: 'COUNT' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/base/fields/${relation.body.data.id}`)
      .send({ config: { multiple: true } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.config).toEqual({
          targetTableId,
          multiple: true,
          relationMode: 'ONE_WAY',
        });
      });
    await request(app.getHttpServer())
      .patch(`/api/base/fields/${relation.body.data.id}`)
      .send({ config: { targetTableId: sourceTableId } })
      .expect(404);
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: relation.body.data.id } }),
    ).resolves.toMatchObject({
      config: { targetTableId, multiple: true, relationMode: 'ONE_WAY' },
    });
    await request(app.getHttpServer())
      .patch(`/api/base/fields/${amount.body.data.id}`)
      .send({ type: DataFieldType.TEXT })
      .expect(400);

    const createdAtField = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({ key: 'createdAt', name: '创建时间', type: DataFieldType.CREATED_AT })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({ key: 'updatedAt', name: '更新时间', type: DataFieldType.UPDATED_AT })
      .expect(201);

    const formula = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'total',
        name: '合计',
        type: DataFieldType.FORMULA,
        config: {
          expression: '{amount} + 2',
          astVersion: 999,
          dependencies: ['forged'],
          ast: { kind: 'literal', value: 999 },
        },
      })
      .expect(201);
    const stored = await prisma.dataField.findUniqueOrThrow({
      where: { id: formula.body.data.id },
    });
    expect(stored.config).toMatchObject({
      expression: '{amount} + 2',
      astVersion: 1,
      dependencies: [amount.body.data.id],
      ast: {
        kind: 'binary',
        left: { kind: 'field', fieldId: amount.body.data.id },
      },
    });

    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'invalidLookup',
        name: '非法引用',
        type: DataFieldType.LOOKUP,
        config: { relationFieldId: amount.body.data.id, targetFieldId: targetTitle.id },
      })
      .expect(400);

    const record = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({ values: { title: '源记录', amount: 3 } })
      .expect(201);
    const foreignRecord = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTableId}/records`)
      .send({ values: { title: '目标记录' } })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/formula-preview`)
      .send({ expression: '{amount} + 2', recordId: record.body.data.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          astVersion: 1,
          dependencies: [amount.body.data.id],
          value: 5,
        });
      });
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/formula-preview`)
      .send({ expression: '{createdAt}', recordId: record.body.data.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          dependencies: [createdAtField.body.data.id],
          value: record.body.data.createdAt,
        });
      });
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/formula-preview`)
      .send({ expression: '{projectTitle}', recordId: record.body.data.id })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/formula-preview`)
      .send({ expression: '{missing}' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/formula-preview`)
      .send({ expression: '{amount}', recordId: foreignRecord.body.data.id })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/base/fields/${amount.body.data.id}`)
      .send({ key: 'renamedAmount', name: '新金额' })
      .expect(400);
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: amount.body.data.id } }),
    ).resolves.toMatchObject({ key: 'amount', name: '金额' });
    expect(lookup.body.data.config).toEqual({
      relationFieldId: relation.body.data.id,
      targetFieldId: targetTitle.id,
    });
  });

  it('serializes concurrent formula dependency updates so the stored graph stays acyclic', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 并发公式工作区` })
      .expect(201);
    const table = await request(app.getHttpServer())
      .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
      .send({ name: `${prefix} 并发公式表` })
      .expect(201);
    const tableId = table.body.data.id as string;
    const [formulaA, formulaB] = await Promise.all(
      ['formulaA', 'formulaB'].map((key) =>
        request(app.getHttpServer())
          .post(`/api/base/tables/${tableId}/fields`)
          .send({ key, name: key, type: DataFieldType.FORMULA, config: { expression: '1' } })
          .expect(201),
      ),
    );

    const updates = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/base/fields/${formulaA.body.data.id}`)
        .send({ config: { expression: '{formulaB}' } }),
      request(app.getHttpServer())
        .patch(`/api/base/fields/${formulaB.body.data.id}`)
        .send({ config: { expression: '{formulaA}' } }),
    ]);
    expect(updates.map((response) => response.status).sort()).toEqual([200, 400]);

    const stored = await prisma.dataField.findMany({
      where: { id: { in: [formulaA.body.data.id, formulaB.body.data.id] } },
    });
    const dependencyCounts = stored.map((field) => {
      const config = field.config as { dependencies?: unknown[] };
      return config.dependencies?.length ?? 0;
    });
    expect(dependencyCounts.sort()).toEqual([0, 1]);
  });

  it('updates a preset task through TasksService so completion clears reminders', async () => {
    const task = await prisma.workTask.create({
      data: { title: `${prefix} 联动任务`, dueAt: new Date('2026-07-25T01:00:00.000Z') },
    });
    await prisma.taskReminder.create({
      data: { taskId: task.id, remindAt: new Date('2026-07-24T01:00:00.000Z') },
    });
    const table = await prisma.dataTable.findFirstOrThrow({
      where: { source: DataTableSource.WORK_TASKS, archivedAt: null },
    });
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/${task.id}`)
      .send({ values: { unexpected: true } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/${task.id}`)
      .send({ values: { updatedAt: new Date().toISOString() } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/${task.id}`)
      .send({ values: { assigneeName: null } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/${task.id}`)
      .send({ values: { status: 'DONE', dueAt: '2026-07-26T01:00:00.000Z' } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: task.id,
          sourcePath: `/my-work?taskId=${task.id}`,
          values: { status: 'DONE' },
        });
      });
    await expect(
      prisma.workTask.findUniqueOrThrow({ where: { id: task.id } }),
    ).resolves.toMatchObject({ status: 'DONE', dueAt: new Date('2026-07-26T01:00:00.000Z') });
    await expect(prisma.taskReminder.count({ where: { taskId: task.id } })).resolves.toBe(0);
  });

  it('projects both meetings and actions into one preset without copies', async () => {
    const meeting = await prisma.meeting.create({
      data: { title: `${prefix} 评审会`, scheduledAt: new Date('2026-07-27T02:00:00.000Z') },
    });
    const action = await prisma.meetingAction.create({
      data: {
        meetingId: meeting.id,
        title: `${prefix} 修订方案`,
        dueAt: new Date('2026-07-28T02:00:00.000Z'),
      },
    });
    const table = await prisma.dataTable.findFirstOrThrow({
      where: { source: DataTableSource.MEETING_ACTIONS, archivedAt: null },
    });
    await request(app.getHttpServer())
      .get(`/api/base/tables/${table.id}/records`)
      .query({ query: prefix })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: `MEETING:${meeting.id}`,
              values: expect.objectContaining({ recordType: 'MEETING' }),
            }),
            expect.objectContaining({
              id: `ACTION:${action.id}`,
              values: expect.objectContaining({ recordType: 'ACTION' }),
            }),
          ]),
        );
      });
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/MEETING:${meeting.id}`)
      .send({ values: { ownerName: '不能写入' } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/MEETING:${meeting.id}`)
      .send({ values: { dateAt: null } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/ACTION:${action.id}`)
      .send({ values: { meetingTitle: '不能写入' } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/ACTION:${action.id}`)
      .send({ values: { dateAt: null } })
      .expect(200);
    await expect(
      prisma.meetingAction.findUniqueOrThrow({ where: { id: action.id } }),
    ).resolves.toMatchObject({ dueAt: null });
    await expect(prisma.dataRecord.count({ where: { tableId: table.id } })).resolves.toBe(0);
  });

  it('rejects concurrent active primary fields at the database boundary', async () => {
    const workspace = await prisma.dataWorkspace.create({ data: { name: `${prefix} 并发工作区` } });
    const table = await prisma.dataTable.create({
      data: { workspaceId: workspace.id, name: `${prefix} 空表` },
    });
    const results = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/base/tables/${table.id}/fields`)
        .send({ key: 'primaryA', name: '主字段 A', type: 'TEXT', isPrimary: true }),
      request(app.getHttpServer())
        .post(`/api/base/tables/${table.id}/fields`)
        .send({ key: 'primaryB', name: '主字段 B', type: 'TEXT', isPrimary: true }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    await expect(
      prisma.dataField.count({ where: { tableId: table.id, isPrimary: true, archivedAt: null } }),
    ).resolves.toBe(1);
  });

  it('writes governance project changes through the domain services and rejects type-specific readonly fields', async () => {
    const [firstProject, secondProject] = await Promise.all([
      prisma.project.create({ data: { code: `${prefix}-P1`, name: `${prefix} 项目一` } }),
      prisma.project.create({ data: { code: `${prefix}-P2`, name: `${prefix} 项目二` } }),
    ]);
    const [risk, decision] = await Promise.all([
      prisma.risk.create({
        data: {
          title: `${prefix} 风险`,
          likelihood: 'MEDIUM',
          impact: 'HIGH',
          level: 'HIGH',
          projectId: firstProject.id,
        },
      }),
      prisma.decision.create({
        data: { title: `${prefix} 决策`, alternatives: [], projectId: firstProject.id },
      }),
    ]);
    const table = await prisma.dataTable.findFirstOrThrow({
      where: { source: DataTableSource.RISKS_DECISIONS, archivedAt: null },
    });
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/DECISION:${decision.id}`)
      .send({ values: { level: 'LOW' } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/RISK:${risk.id}`)
      .send({ values: { projectId: null } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/RISK:${risk.id}`)
      .send({ values: { projectId: secondProject.id } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/DECISION:${decision.id}`)
      .send({ values: { projectId: secondProject.id } })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/base/tables/${table.id}/records`)
      .query({ query: prefix })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: `RISK:${risk.id}`,
              sourcePath: `/library/governance/risks?recordId=${risk.id}&projectId=${secondProject.id}`,
            }),
            expect.objectContaining({
              id: `DECISION:${decision.id}`,
              sourcePath: `/library/governance/decisions?recordId=${decision.id}&projectId=${secondProject.id}`,
            }),
          ]),
        );
      });
    await expect(prisma.risk.findUniqueOrThrow({ where: { id: risk.id } })).resolves.toMatchObject({
      projectId: secondProject.id,
    });
    await expect(
      prisma.decision.findUniqueOrThrow({ where: { id: decision.id } }),
    ).resolves.toMatchObject({ projectId: secondProject.id });
  });
});
