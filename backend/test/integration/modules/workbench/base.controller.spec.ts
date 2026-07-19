import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataFieldType, DataTableSource, Prisma, PrismaClient } from '@prisma/client';
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
    await prisma.contentDocument.deleteMany({ where: { title: { startsWith: prefix } } });
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

  it('creates paired two-way relation fields with trusted inverse configs', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 双向字段工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['来源表', '目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTable.body.data.id}/fields`)
      .send({ key: 'inverse_owners', name: '已有反向键', type: DataFieldType.TEXT })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'owners',
        name: '负责人',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: true,
          relationMode: 'TWO_WAY',
        },
        inverseFieldName: '负责事项',
        inverseMultiple: false,
      })
      .expect(201);

    const inverse = await prisma.dataField.findFirstOrThrow({
      where: { tableId: targetTable.body.data.id, name: '负责事项', archivedAt: null },
    });
    expect(inverse.key).toBe('inverse_owners_2');
    expect(created.body.data.config).toEqual({
      targetTableId: targetTable.body.data.id,
      multiple: true,
      relationMode: 'TWO_WAY',
      inverseFieldId: inverse.id,
    });
    expect(inverse.config).toEqual({
      targetTableId: sourceTable.body.data.id,
      multiple: false,
      relationMode: 'TWO_WAY',
      inverseFieldId: created.body.data.id,
    });
    const inverseCount = await prisma.dataField.count({
      where: { tableId: targetTable.body.data.id, type: DataFieldType.RELATION },
    });
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'owners',
        name: '重复负责人',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: true,
          relationMode: 'TWO_WAY',
        },
        inverseFieldName: '不应创建',
      })
      .expect(409);
    await expect(
      prisma.dataField.count({
        where: { tableId: targetTable.body.data.id, type: DataFieldType.RELATION },
      }),
    ).resolves.toBe(inverseCount);
  });

  it('synchronizes a two-way relation when creating and updating custom records', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 双向同步工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['同步来源表', '同步目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'targets',
        name: '目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: true,
          relationMode: 'TWO_WAY',
        },
        inverseFieldName: '来源',
      })
      .expect(201);
    const inverse = await prisma.dataField.findUniqueOrThrow({
      where: { id: relation.body.data.config.inverseFieldId },
    });
    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTable.body.data.id}/records`)
      .send({ values: { title: '目标记录' } })
      .expect(201);
    const source = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
      .send({ values: { title: '来源记录', targets: [target.body.data.id] } })
      .expect(201);

    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({
      values: { title: '目标记录', [inverse.key]: [source.body.data.id] },
    });

    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTable.body.data.id}/records/${source.body.data.id}`)
      .send({ values: { targets: [] } })
      .expect(200);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '目标记录', [inverse.key]: [] } });

    await request(app.getHttpServer())
      .patch(`/api/base/tables/${targetTable.body.data.id}/records/${target.body.data.id}`)
      .send({ values: { [inverse.key]: [source.body.data.id] } })
      .expect(200);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { targets: [target.body.data.id] } });

    const [secondSource, secondTarget] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
        .send({ values: { title: '来源记录二' } })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/base/tables/${targetTable.body.data.id}/records`)
        .send({ values: { title: '目标记录二' } })
        .expect(201),
    ]);
    const bothSources = [source.body.data.id, secondSource.body.data.id];
    for (const sourceIds of [bothSources, bothSources]) {
      await request(app.getHttpServer())
        .patch(`/api/base/tables/${targetTable.body.data.id}/records/${target.body.data.id}`)
        .send({ values: { [inverse.key]: sourceIds } })
        .expect(200);
    }
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { targets: [target.body.data.id] } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: secondSource.body.data.id } }),
    ).resolves.toMatchObject({ values: { targets: [target.body.data.id] } });
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${targetTable.body.data.id}/records/${target.body.data.id}`)
      .send({ values: { [inverse.key]: [secondSource.body.data.id] } })
      .expect(200);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { targets: [] } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: secondSource.body.data.id } }),
    ).resolves.toMatchObject({ values: { targets: [target.body.data.id] } });

    await request(app.getHttpServer())
      .patch(`/api/base/tables/${targetTable.body.data.id}/records/${secondTarget.body.data.id}`)
      .send({ values: { [inverse.key]: [source.body.data.id, secondSource.body.data.id] } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${targetTable.body.data.id}/records/${secondTarget.body.data.id}`)
      .send({ values: { [inverse.key]: [source.body.data.id] } })
      .expect(200);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { targets: [secondTarget.body.data.id] } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: secondSource.body.data.id } }),
    ).resolves.toMatchObject({ values: { targets: [target.body.data.id] } });
  });

  it('rejects inverse options outside two-way relation creation', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 反向参数工作区` })
      .expect(201);
    const table = await request(app.getHttpServer())
      .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
      .send({ name: `${prefix} 反向参数表` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/base/tables/${table.body.data.id}/fields`)
      .send({
        key: 'badText',
        name: '非法文本',
        type: DataFieldType.TEXT,
        inverseFieldName: '不允许',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${table.body.data.id}/fields`)
      .send({
        key: 'badOneWay',
        name: '非法单向',
        type: DataFieldType.RELATION,
        config: { targetTableId: table.body.data.id, multiple: false, relationMode: 'ONE_WAY' },
        inverseMultiple: true,
      })
      .expect(400);
  });

  it('rejects changing a one-way relation to two-way without creating a pair', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 单向升级工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['单向升级来源表', '单向升级目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'target',
        name: '单向目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: false,
          relationMode: 'ONE_WAY',
        },
      })
      .expect(201);
    const targetFieldCount = await prisma.dataField.count({
      where: { tableId: targetTable.body.data.id },
    });

    await request(app.getHttpServer())
      .patch(`/api/base/fields/${relation.body.data.id}`)
      .send({ config: { relationMode: 'TWO_WAY' } })
      .expect(400)
      .expect(({ body }) => {
        expect(JSON.stringify(body)).toContain('recreate');
      });
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: relation.body.data.id } }),
    ).resolves.toMatchObject({
      config: {
        targetTableId: targetTable.body.data.id,
        multiple: false,
        relationMode: 'ONE_WAY',
      },
    });
    await expect(
      prisma.dataField.count({ where: { tableId: targetTable.body.data.id } }),
    ).resolves.toBe(targetFieldCount);

    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTable.body.data.id}/records`)
      .send({ values: { title: '单向目标记录' } })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
      .send({ values: { title: '单向来源记录', target: target.body.data.id } })
      .expect(201);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '单向目标记录' } });
  });

  it('enforces relation cardinality and serializes concurrent one-to-one claims', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 关系基数工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['基数来源表', '基数目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const sourceTableId = sourceTable.body.data.id as string;
    const targetTableId = targetTable.body.data.id as string;
    const oneToOne = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'exclusiveTarget',
        name: '独占目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: false, relationMode: 'TWO_WAY' },
        inverseFieldName: '独占来源',
        inverseMultiple: false,
      })
      .expect(201);
    const inverse = await prisma.dataField.findUniqueOrThrow({
      where: { id: oneToOne.body.data.config.inverseFieldId },
    });
    const [firstSource, secondSource, target] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTableId}/records`)
        .send({ values: { title: '来源一' } })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTableId}/records`)
        .send({ values: { title: '来源二' } })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/base/tables/${targetTableId}/records`)
        .send({ values: { title: '独占目标' } })
        .expect(201),
    ]);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTableId}/records/${firstSource.body.data.id}`)
      .send({ values: { exclusiveTarget: [target.body.data.id] } })
      .expect(400);

    const claims = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/base/tables/${sourceTableId}/records/${firstSource.body.data.id}`)
        .send({ values: { exclusiveTarget: target.body.data.id } }),
      request(app.getHttpServer())
        .patch(`/api/base/tables/${sourceTableId}/records/${secondSource.body.data.id}`)
        .send({ values: { exclusiveTarget: target.body.data.id } }),
    ]);
    expect(claims.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = claims.find((response) => response.status === 200)!;
    const loserId =
      winner.body.data.id === firstSource.body.data.id
        ? secondSource.body.data.id
        : firstSource.body.data.id;
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { [inverse.key]: winner.body.data.id } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: loserId } }),
    ).resolves.toMatchObject({
      values: { title: expect.any(String) },
    });
    expect(
      (await prisma.dataRecord.findUniqueOrThrow({ where: { id: loserId } })).values,
    ).not.toHaveProperty('exclusiveTarget');
    const sourceCount = await prisma.dataRecord.count({ where: { tableId: sourceTableId } });
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({ values: { title: '回滚来源', exclusiveTarget: target.body.data.id } })
      .expect(409);
    await expect(prisma.dataRecord.count({ where: { tableId: sourceTableId } })).resolves.toBe(
      sourceCount,
    );
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTableId}/records/${winner.body.data.id}`)
      .send({ values: { exclusiveTarget: target.body.data.id } })
      .expect(200);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { [inverse.key]: winner.body.data.id } });

    const competingTarget = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTableId}/records`)
      .send({ values: { title: '竞争目标' } })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${targetTableId}/records/${competingTarget.body.data.id}`)
      .send({ values: { [inverse.key]: winner.body.data.id } })
      .expect(409);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: winner.body.data.id } }),
    ).resolves.toMatchObject({ values: { exclusiveTarget: target.body.data.id } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: competingTarget.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '竞争目标' } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { [inverse.key]: winner.body.data.id } });
  });

  it('synchronizes one-to-many and many-to-many swaps and diffs without duplicates', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 关系差集工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['差集来源表', '差集目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const sourceTableId = sourceTable.body.data.id as string;
    const targetTableId = targetTable.body.data.id as string;
    const manyToMany = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'targets',
        name: '多个目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: true, relationMode: 'TWO_WAY' },
        inverseFieldName: '多个来源',
        inverseMultiple: true,
      })
      .expect(201);
    const inverse = await prisma.dataField.findUniqueOrThrow({
      where: { id: manyToMany.body.data.config.inverseFieldId },
    });
    const [firstTarget, secondTarget] = await Promise.all(
      ['目标一', '目标二'].map((title) =>
        request(app.getHttpServer())
          .post(`/api/base/tables/${targetTableId}/records`)
          .send({ values: { title } })
          .expect(201),
      ),
    );
    const source = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({
        values: {
          title: '多值来源',
          targets: [firstTarget.body.data.id, secondTarget.body.data.id],
        },
      })
      .expect(201);

    for (const targets of [
      [secondTarget.body.data.id],
      [secondTarget.body.data.id],
      [firstTarget.body.data.id],
    ]) {
      await request(app.getHttpServer())
        .patch(`/api/base/tables/${sourceTableId}/records/${source.body.data.id}`)
        .send({ values: { targets } })
        .expect(200);
    }
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: firstTarget.body.data.id } }),
    ).resolves.toMatchObject({ values: { [inverse.key]: [source.body.data.id] } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: secondTarget.body.data.id } }),
    ).resolves.toMatchObject({ values: { [inverse.key]: [] } });

    const oneToMany = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'ownedTargets',
        name: '独占多个目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: true, relationMode: 'TWO_WAY' },
        inverseFieldName: '单一来源',
        inverseMultiple: false,
      })
      .expect(201);
    expect(oneToMany.body.data.config.multiple).toBe(true);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTableId}/records/${source.body.data.id}`)
      .send({ values: { ownedTargets: [secondTarget.body.data.id] } })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({ values: { title: '冲突来源', ownedTargets: [secondTarget.body.data.id] } })
      .expect(409);
  });

  it('validates relation value shape, uniqueness and custom target ownership', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 关系校验工作区` })
      .expect(201);
    const [sourceTable, targetTable, wrongTable] = await Promise.all(
      ['校验来源表', '校验目标表', '错误目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'targets',
        name: '多个目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: true,
          relationMode: 'TWO_WAY',
        },
        inverseFieldName: '多个来源',
      })
      .expect(201);
    expect(relation.body.data.config.inverseFieldId).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'singleTarget',
        name: '单个目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: false,
          relationMode: 'ONE_WAY',
        },
      })
      .expect(201);
    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTable.body.data.id}/records`)
      .send({ values: { title: '正确目标' } })
      .expect(201);
    const wrong = await request(app.getHttpServer())
      .post(`/api/base/tables/${wrongTable.body.data.id}/records`)
      .send({ values: { title: '错误目标' } })
      .expect(201);

    for (const targets of [
      target.body.data.id,
      [target.body.data.id, target.body.data.id],
      [''],
      ['missing-record-id'],
      [wrong.body.data.id],
    ]) {
      await request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
        .send({ values: { title: '非法来源', targets } })
        .expect(400);
    }
    for (const values of [{ targets: '' }, { singleTarget: '' }]) {
      await request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
        .send({ values: { title: '空串来源', ...values } })
        .expect(400);
    }

    const retained = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
      .send({ values: { title: '保留记录', targets: [target.body.data.id] } })
      .expect(201);
    for (const values of [{ targets: '' }, { singleTarget: '' }]) {
      await request(app.getHttpServer())
        .patch(`/api/base/tables/${sourceTable.body.data.id}/records/${retained.body.data.id}`)
        .send({ values })
        .expect(400);
    }
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: retained.body.data.id } }),
    ).resolves.toMatchObject({
      values: { title: '保留记录', targets: [target.body.data.id] },
    });
  });

  it('cleans inverse values on record deletion and safely decouples relation fields', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 关系清理工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['清理来源表', '清理目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const sourceTableId = sourceTable.body.data.id as string;
    const targetTableId = targetTable.body.data.id as string;
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'targets',
        name: '目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: true, relationMode: 'TWO_WAY' },
        inverseFieldName: '来源',
      })
      .expect(201);
    const inverse = await prisma.dataField.findUniqueOrThrow({
      where: { id: relation.body.data.config.inverseFieldId },
    });
    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTableId}/records`)
      .send({ values: { title: '目标记录' } })
      .expect(201);
    const deletedSource = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({ values: { title: '待删除来源', targets: [target.body.data.id] } })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/base/tables/${sourceTableId}/records/${deletedSource.body.data.id}`)
      .expect(204);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { [inverse.key]: [] } });

    const retainedSource = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({ values: { title: '保留来源', targets: [target.body.data.id] } })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/base/fields/${relation.body.data.id}`)
      .expect(204);
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: relation.body.data.id } }),
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: inverse.id } }),
    ).resolves.toMatchObject({
      archivedAt: null,
      config: { targetTableId: sourceTableId, multiple: true, relationMode: 'ONE_WAY' },
    });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: retainedSource.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '保留来源' } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '目标记录' } });
  });

  it('decouples the previous pair before changing a two-way relation mode', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 关系模式工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['模式来源表', '模式目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'target',
        name: '目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: false,
          relationMode: 'TWO_WAY',
        },
        inverseFieldName: '来源',
      })
      .expect(201);
    const inverseId = relation.body.data.config.inverseFieldId as string;
    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTable.body.data.id}/records`)
      .send({ values: { title: '目标' } })
      .expect(201);
    const source = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
      .send({ values: { title: '来源', target: target.body.data.id } })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/base/fields/${relation.body.data.id}`)
      .send({ config: { relationMode: 'ONE_WAY' }, isPrimary: true })
      .expect(409);
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: relation.body.data.id } }),
    ).resolves.toMatchObject({
      config: {
        targetTableId: targetTable.body.data.id,
        multiple: false,
        relationMode: 'TWO_WAY',
        inverseFieldId: inverseId,
      },
    });
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: inverseId } }),
    ).resolves.toMatchObject({
      config: expect.objectContaining({ relationMode: 'TWO_WAY' }),
    });

    await request(app.getHttpServer())
      .patch(`/api/base/fields/${relation.body.data.id}`)
      .send({ config: { relationMode: 'ONE_WAY' } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.config).toEqual({
          targetTableId: targetTable.body.data.id,
          multiple: false,
          relationMode: 'ONE_WAY',
        });
      });
    const inverse = await prisma.dataField.findUniqueOrThrow({ where: { id: inverseId } });
    expect(inverse.config).toEqual({
      targetTableId: sourceTable.body.data.id,
      multiple: true,
      relationMode: 'ONE_WAY',
    });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '来源', target: target.body.data.id } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '目标' } });
  });

  it('rejects populated target changes and decouples an empty two-way pair', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 关系目标变更工作区` })
      .expect(201);
    const [sourceTable, oldTargetTable, newTargetTable] = await Promise.all(
      ['目标变更来源表', '旧目标表', '新目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'target',
        name: '目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: oldTargetTable.body.data.id,
          multiple: false,
          relationMode: 'TWO_WAY',
        },
        inverseFieldName: '来源',
      })
      .expect(201);
    const inverse = await prisma.dataField.findUniqueOrThrow({
      where: { id: relation.body.data.config.inverseFieldId },
    });
    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${oldTargetTable.body.data.id}/records`)
      .send({ values: { title: '旧目标' } })
      .expect(201);
    const source = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
      .send({ values: { title: '来源', target: target.body.data.id } })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/base/fields/${relation.body.data.id}`)
      .send({ config: { targetTableId: newTargetTable.body.data.id } })
      .expect(409);
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: relation.body.data.id } }),
    ).resolves.toMatchObject({
      config: {
        targetTableId: oldTargetTable.body.data.id,
        multiple: false,
        relationMode: 'TWO_WAY',
        inverseFieldId: inverse.id,
      },
    });
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: inverse.id } }),
    ).resolves.toMatchObject({
      config: expect.objectContaining({ relationMode: 'TWO_WAY' }),
    });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { target: target.body.data.id } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { [inverse.key]: [source.body.data.id] } });

    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTable.body.data.id}/records/${source.body.data.id}`)
      .send({ values: { target: null } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/base/fields/${relation.body.data.id}`)
      .send({ config: { targetTableId: newTargetTable.body.data.id } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.config).toEqual({
          targetTableId: newTargetTable.body.data.id,
          multiple: false,
          relationMode: 'ONE_WAY',
        });
      });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '来源' } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '旧目标' } });
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: inverse.id } }),
    ).resolves.toMatchObject({
      config: {
        targetTableId: sourceTable.body.data.id,
        multiple: true,
        relationMode: 'ONE_WAY',
      },
    });
  });

  it('rejects archiving custom tables with outgoing or incoming normalized relations', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 表关系归档工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['归档来源表', '归档目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'target',
        name: '归档目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: false,
          relationMode: 'ONE_WAY',
        },
      })
      .expect(201);
    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTable.body.data.id}/records`)
      .send({ values: { title: '归档目标记录' } })
      .expect(201);
    const source = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
      .send({ values: { title: '归档来源记录', target: target.body.data.id } })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/base/tables/${sourceTable.body.data.id}`)
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/base/tables/${targetTable.body.data.id}`)
      .expect(409);
    await expect(
      prisma.dataTable.findUniqueOrThrow({ where: { id: sourceTable.body.data.id } }),
    ).resolves.toMatchObject({ archivedAt: null });
    await expect(
      prisma.dataTable.findUniqueOrThrow({ where: { id: targetTable.body.data.id } }),
    ).resolves.toMatchObject({ archivedAt: null });
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: relation.body.data.id } }),
    ).resolves.toMatchObject({ archivedAt: null });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { target: target.body.data.id } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '归档目标记录' } });
  });

  it('ignores active relation fields owned by historically archived tables', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 历史关系归档工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['历史归档来源表', '历史归档目标表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'historicalTarget',
        name: '历史目标',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: targetTable.body.data.id,
          multiple: false,
          relationMode: 'ONE_WAY',
        },
      })
      .expect(201);
    await prisma.dataTable.update({
      where: { id: sourceTable.body.data.id },
      data: { archivedAt: new Date() },
    });

    await request(app.getHttpServer())
      .delete(`/api/base/tables/${targetTable.body.data.id}`)
      .expect(204);
    await expect(
      prisma.dataTable.findUniqueOrThrow({ where: { id: targetTable.body.data.id } }),
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
  });

  it('rejects relation target or cardinality changes while non-empty values exist', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 关系配置存量工作区` })
      .expect(201);
    const [sourceTable, targetTable, otherTable] = await Promise.all(
      ['配置来源表', '配置目标表', '配置其他表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const sourceTableId = sourceTable.body.data.id as string;
    const targetTableId = targetTable.body.data.id as string;
    const otherTableId = otherTable.body.data.id as string;
    const target = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTableId}/records`)
      .send({ values: { title: '配置目标记录' } })
      .expect(201);
    const oneWay = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'oneWayTarget',
        name: '单向目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: false, relationMode: 'ONE_WAY' },
      })
      .expect(201);
    const many = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'manyTargets',
        name: '多个目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: true, relationMode: 'ONE_WAY' },
      })
      .expect(201);
    const source = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({
        values: {
          title: '配置来源记录',
          oneWayTarget: target.body.data.id,
          manyTargets: [target.body.data.id],
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/base/fields/${oneWay.body.data.id}`)
      .send({ config: { targetTableId: otherTableId } })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/base/fields/${many.body.data.id}`)
      .send({ config: { multiple: false } })
      .expect(409);
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: oneWay.body.data.id } }),
    ).resolves.toMatchObject({
      config: { targetTableId, multiple: false, relationMode: 'ONE_WAY' },
    });
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: many.body.data.id } }),
    ).resolves.toMatchObject({
      config: { targetTableId, multiple: true, relationMode: 'ONE_WAY' },
    });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({
      values: {
        oneWayTarget: target.body.data.id,
        manyTargets: [target.body.data.id],
      },
    });

    const paired = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'sharedTarget',
        name: '共享目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: false, relationMode: 'TWO_WAY' },
        inverseFieldName: '多个共享来源',
        inverseMultiple: true,
      })
      .expect(201);
    const inverse = await prisma.dataField.findUniqueOrThrow({
      where: { id: paired.body.data.config.inverseFieldId },
    });
    const secondSource = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({ values: { title: '配置来源记录二', sharedTarget: target.body.data.id } })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTableId}/records/${source.body.data.id}`)
      .send({ values: { sharedTarget: target.body.data.id } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/base/fields/${inverse.id}`)
      .send({ config: { multiple: false } })
      .expect(409);
    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: inverse.id } }),
    ).resolves.toMatchObject({
      config: {
        targetTableId: sourceTableId,
        multiple: true,
        relationMode: 'TWO_WAY',
        inverseFieldId: paired.body.data.id,
      },
    });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: target.body.data.id } }),
    ).resolves.toMatchObject({
      values: { [inverse.key]: [secondSource.body.data.id, source.body.data.id] },
    });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: source.body.data.id } }),
    ).resolves.toMatchObject({ values: { sharedTarget: target.body.data.id } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: secondSource.body.data.id } }),
    ).resolves.toMatchObject({ values: { sharedTarget: target.body.data.id } });

    const emptyMany = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'emptyTargets',
        name: '空目标',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: true, relationMode: 'ONE_WAY' },
      })
      .expect(201);
    await Promise.all([
      request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTableId}/records`)
        .send({ values: { title: '未定义空目标' } })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTableId}/records`)
        .send({ values: { title: '空值目标', emptyTargets: null } })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/base/tables/${sourceTableId}/records`)
        .send({ values: { title: '空数组目标', emptyTargets: [] } })
        .expect(201),
    ]);
    await request(app.getHttpServer())
      .patch(`/api/base/fields/${emptyMany.body.data.id}`)
      .send({ config: { multiple: false, targetTableId: otherTableId } })
      .expect(200);
  });

  it('rechecks archived custom tables after record mutations acquire their advisory locks', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 记录归档竞态工作区` })
      .expect(201);
    const tables = await Promise.all(
      ['创建竞态表', '更新竞态表', '删除竞态表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const updateRecord = await request(app.getHttpServer())
      .post(`/api/base/tables/${tables[1].body.data.id}/records`)
      .send({ values: { title: '更新前' } })
      .expect(201);
    const deleteRecord = await request(app.getHttpServer())
      .post(`/api/base/tables/${tables[2].body.data.id}/records`)
      .send({ values: { title: '不可删除' } })
      .expect(201);

    const archiveWhileBlocked = async (
      tableId: string,
      mutationFactory: () => PromiseLike<{ status: number }>,
    ) => {
      let mutation!: Promise<{ status: number }>;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:data-field-config:${tableId}`}))`,
        );
        mutation = Promise.resolve(mutationFactory());
        const state = await Promise.race([
          mutation.then(() => 'settled'),
          new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
        ]);
        expect(state).toBe('blocked');
        await tx.dataTable.update({ where: { id: tableId }, data: { archivedAt: new Date() } });
      });
      return mutation;
    };

    const createResponse = await archiveWhileBlocked(tables[0].body.data.id, () =>
      request(app.getHttpServer())
        .post(`/api/base/tables/${tables[0].body.data.id}/records`)
        .send({ values: { title: '不可创建' } }),
    );
    const updateResponse = await archiveWhileBlocked(tables[1].body.data.id, () =>
      request(app.getHttpServer())
        .patch(`/api/base/tables/${tables[1].body.data.id}/records/${updateRecord.body.data.id}`)
        .send({ values: { title: '更新后' } }),
    );
    const deleteResponse = await archiveWhileBlocked(tables[2].body.data.id, () =>
      request(app.getHttpServer()).delete(
        `/api/base/tables/${tables[2].body.data.id}/records/${deleteRecord.body.data.id}`,
      ),
    );

    expect([createResponse.status, updateResponse.status, deleteResponse.status]).toEqual([
      404, 404, 404,
    ]);
    await expect(
      prisma.dataRecord.count({
        where: { tableId: tables[0].body.data.id, values: { path: ['title'], equals: '不可创建' } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: updateRecord.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '更新前' } });
    await expect(
      prisma.dataRecord.findUniqueOrThrow({ where: { id: deleteRecord.body.data.id } }),
    ).resolves.toMatchObject({ values: { title: '不可删除' } });
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

  it('preserves empty-string project clears for preset document relations', async () => {
    const project = await prisma.project.create({
      data: { code: `${prefix}-DOC`, name: `${prefix} 文档项目` },
    });
    const document = await prisma.contentDocument.create({
      data: {
        type: 'DOCUMENT',
        title: `${prefix} 待清空项目文档`,
        projectId: project.id,
      },
    });
    const table = await prisma.dataTable.findFirstOrThrow({
      where: { source: DataTableSource.DOCUMENTS, archivedAt: null },
    });

    await request(app.getHttpServer())
      .patch(`/api/base/tables/${table.id}/records/${document.id}`)
      .send({ values: { projectId: '' } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: document.id,
          sourceType: 'DOCUMENT',
          values: { projectId: null },
        });
      });
    await expect(
      prisma.contentDocument.findUniqueOrThrow({ where: { id: document.id } }),
    ).resolves.toMatchObject({ projectId: null });
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

  it('resolves computed values on every custom record response and rejects computed writes', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 计算响应工作区` })
      .expect(201);
    const [sourceTable, targetTable] = await Promise.all(
      ['计算来源', '计算目标'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const sourceTableId = sourceTable.body.data.id as string;
    const targetTableId = targetTable.body.data.id as string;
    const targetTitle = targetTable.body.data.fields.find(
      (field: { key: string }) => field.key === 'title',
    );
    const score = await request(app.getHttpServer())
      .post(`/api/base/tables/${targetTableId}/fields`)
      .send({ key: 'score', name: '评分', type: DataFieldType.NUMBER })
      .expect(201);
    const [targetA, targetB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/base/tables/${targetTableId}/records`)
        .send({ values: { title: '岗位甲', score: 80 } })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/base/tables/${targetTableId}/records`)
        .send({ values: { title: '岗位乙', score: 100 } })
        .expect(201),
    ]);
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'positions',
        name: '岗位',
        type: DataFieldType.RELATION,
        config: { targetTableId, multiple: true, relationMode: 'ONE_WAY' },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'positionNames',
        name: '岗位名称',
        type: DataFieldType.LOOKUP,
        config: { relationFieldId: relation.body.data.id, targetFieldId: targetTitle.id },
      })
      .expect(201);
    const average = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'averageScore',
        name: '平均评分',
        type: DataFieldType.ROLLUP,
        config: {
          relationFieldId: relation.body.data.id,
          targetFieldId: score.body.data.id,
          aggregation: 'AVG',
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'result',
        name: '结果',
        type: DataFieldType.FORMULA,
        config: { expression: 'IF({averageScore} >= 90, "通过", "继续评估")' },
      })
      .expect(201);
    const createdAtField = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({ key: 'createdAt', name: '创建时间', type: DataFieldType.CREATED_AT })
      .expect(201);
    const updatedAtField = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({ key: 'updatedAt', name: '更新时间', type: DataFieldType.UPDATED_AT })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'createdCopy',
        name: '创建时间公式',
        type: DataFieldType.FORMULA,
        config: { expression: '{createdAt}' },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/fields`)
      .send({
        key: 'updatedCopy',
        name: '更新时间公式',
        type: DataFieldType.FORMULA,
        config: { expression: '{updatedAt}' },
      })
      .expect(201);

    await prisma.dataField.update({
      where: { id: average.body.data.id },
      data: { isRequired: true },
    });

    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({ values: { title: '不可写', averageScore: 90 } })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTableId}/records`)
      .send({
        values: {
          title: '候选人',
          positions: [targetB.body.data.id, targetA.body.data.id],
        },
      })
      .expect(201);
    expect(created.body.data.values).toMatchObject({
      positionNames: ['岗位乙', '岗位甲'],
      averageScore: 90,
      result: '通过',
      createdAt: created.body.data.createdAt,
      updatedAt: created.body.data.updatedAt,
      createdCopy: created.body.data.createdAt,
      updatedCopy: created.body.data.updatedAt,
    });
    const originalCreatedAt = created.body.data.createdAt as string;
    expect(createdAtField.body.data.id).toBeTruthy();
    expect(updatedAtField.body.data.id).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTableId}/records/${created.body.data.id}`)
      .send({ values: { result: '伪造结果' } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/base/tables/${sourceTableId}/records/${created.body.data.id}`)
      .send({ values: { title: '候选人（更新）' } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.values).toMatchObject({
          title: '候选人（更新）',
          positionNames: ['岗位乙', '岗位甲'],
          averageScore: 90,
          result: '通过',
          createdAt: originalCreatedAt,
          createdCopy: originalCreatedAt,
          updatedAt: body.data.updatedAt,
          updatedCopy: body.data.updatedAt,
        });
      });
    await request(app.getHttpServer())
      .get(`/api/base/tables/${sourceTableId}/records`)
      .expect(200)
      .expect(({ body }) => {
        const listed = body.data.data[0];
        expect(listed.values.updatedCopy).toBe(listed.values.updatedAt);
        expect(body.data.data).toEqual([
          expect.objectContaining({
            id: created.body.data.id,
            values: expect.objectContaining({
              positionNames: ['岗位乙', '岗位甲'],
              averageScore: 90,
              result: '通过',
              createdAt: originalCreatedAt,
              createdCopy: originalCreatedAt,
            }),
          }),
        ]);
      });

    await expect(
      prisma.dataField.findUniqueOrThrow({ where: { id: average.body.data.id } }),
    ).resolves.toMatchObject({ isRequired: true });
  });

  it('resolves lookups whose target is a system preset table through its adapter', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 系统引用工作区` })
      .expect(201);
    const sourceTable = await request(app.getHttpServer())
      .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
      .send({ name: `${prefix} 系统引用来源` })
      .expect(201);
    const projectTable = await prisma.dataTable.findFirstOrThrow({
      where: { source: DataTableSource.PROJECTS, archivedAt: null },
      include: { fields: { where: { archivedAt: null } } },
    });
    const projectName = projectTable.fields.find((field) => field.key === 'name')!;
    const project = await prisma.project.create({
      data: { code: `${prefix}-SYSTEM-LOOKUP`, name: `${prefix} 系统项目` },
    });
    const relation = await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'project',
        name: '项目',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: projectTable.id,
          multiple: false,
          relationMode: 'ONE_WAY',
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/fields`)
      .send({
        key: 'projectName',
        name: '项目名称',
        type: DataFieldType.LOOKUP,
        config: { relationFieldId: relation.body.data.id, targetFieldId: projectName.id },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/base/tables/${sourceTable.body.data.id}/records`)
      .send({ values: { title: '系统引用', project: project.id } })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.values.projectName).toBe(`${prefix} 系统项目`);
      });
  });

  it('executes persisted views before pagination for custom and system records', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 保存视图工作区` })
      .expect(201);
    const [table, otherTable] = await Promise.all(
      ['保存筛选', '其他表'].map((name) =>
        request(app.getHttpServer())
          .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
          .send({ name: `${prefix} ${name}` })
          .expect(201),
      ),
    );
    const tableId = table.body.data.id as string;
    const score = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({ key: 'score', name: '评分', type: DataFieldType.NUMBER })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({ key: 'status', name: '状态', type: DataFieldType.SINGLE_SELECT })
      .expect(201);
    const records = await Promise.all(
      [
        { title: `${prefix} 甲`, score: 90, status: 'OPEN' },
        { title: `${prefix} 乙`, score: 80, status: 'OPEN' },
        { title: `${prefix} 丙`, score: 100, status: 'CLOSED' },
      ].map((values) =>
        request(app.getHttpServer())
          .post(`/api/base/tables/${tableId}/records`)
          .send({ values })
          .expect(201),
      ),
    );
    const view = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({
        name: '高分开放项',
        type: 'GRID',
        config: {
          query: prefix,
          filters: [
            { fieldKey: 'status', operator: 'EQ', value: 'OPEN' },
            { fieldKey: 'score', operator: 'GTE', value: 80 },
          ],
          sorts: [{ fieldKey: 'score', direction: 'desc' }],
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/base/tables/${tableId}/records`)
      .query({ viewId: view.body.data.id, pageSize: 1 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
        expect(body.data.data.map((record: { id: string }) => record.id)).toEqual([
          records[0].body.data.id,
        ]);
      });
    await request(app.getHttpServer())
      .get(`/api/base/tables/${tableId}/records`)
      .query({ viewId: view.body.data.id, query: '乙' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta.total).toBe(1);
        expect(body.data.data[0].id).toBe(records[1].body.data.id);
      });
    await request(app.getHttpServer())
      .get(`/api/base/tables/${otherTable.body.data.id}/records`)
      .query({ viewId: view.body.data.id, recordIds: records[0].body.data.id })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/base/tables/${tableId}/records`)
      .query({ viewId: 'missing-view-id' })
      .expect(404);

    const formula = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({
        key: 'scoreCopy',
        name: '评分副本',
        type: DataFieldType.FORMULA,
        config: { expression: '{score}' },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({
        name: '非法计算筛选',
        type: 'GRID',
        config: { filters: [{ fieldKey: 'scoreCopy', operator: 'EQ', value: 90 }] },
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({
        name: '非法画册字段',
        type: 'GALLERY',
        config: {
          titleFieldKey: 'foreignField',
          coverFieldKey: 'score',
          visibleFieldIds: ['foreign-field-id'],
        },
      })
      .expect(400);
    const disguisedGantt = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({
        name: '待转换视图',
        type: 'GRID',
        config: { startFieldKey: 'scoreCopy', endFieldKey: 'score' },
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/base/views/${disguisedGantt.body.data.id}`)
      .send({ type: 'GANTT' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({
        name: '非法甘特轴',
        type: 'GANTT',
        config: { startFieldKey: 'scoreCopy', endFieldKey: 'score' },
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({
        name: '非法字段',
        type: 'GRID',
        config: { filters: [{ fieldKey: 'foreignField', operator: 'EQ', value: 'x' }] },
      })
      .expect(400);

    const legacyField = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/fields`)
      .send({ key: 'legacy', name: '已归档字段', type: DataFieldType.TEXT })
      .expect(201);
    const archivedView = await request(app.getHttpServer())
      .post(`/api/base/tables/${tableId}/views`)
      .send({
        name: '归档字段兼容',
        type: 'GRID',
        config: {
          filterField: 'legacy',
          filterValue: 'old',
          sortField: 'legacy',
          sortOrder: 'asc',
        },
      })
      .expect(201);
    expect(archivedView.body.data.config).toEqual({
      filters: [{ fieldKey: 'legacy', operator: 'EQ', value: 'old' }],
      sorts: [{ fieldKey: 'legacy', direction: 'asc' }],
    });
    await request(app.getHttpServer())
      .delete(`/api/base/fields/${legacyField.body.data.id}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/base/tables/${tableId}/records`)
      .query({ viewId: archivedView.body.data.id })
      .expect(200)
      .expect(({ body }) => expect(body.data.meta.total).toBe(3));

    const project = await prisma.project.create({
      data: { code: `${prefix}-VIEW-SYSTEM`, name: `${prefix} 系统保存视图` },
    });
    const projectTable = await prisma.dataTable.findFirstOrThrow({
      where: { source: DataTableSource.PROJECTS, archivedAt: null },
    });
    const systemView = await request(app.getHttpServer())
      .post(`/api/base/tables/${projectTable.id}/views`)
      .send({
        name: `${prefix} 系统筛选`,
        type: 'GRID',
        config: {
          filters: [{ fieldKey: 'code', operator: 'CONTAINS', value: 'VIEW-SYSTEM' }],
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/base/tables/${projectTable.id}/records`)
      .query({ viewId: systemView.body.data.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta.total).toBe(1);
        expect(body.data.data[0].id).toBe(project.id);
      });
    await request(app.getHttpServer())
      .delete(`/api/base/views/${systemView.body.data.id}`)
      .expect(204);

    expect(score.body.data.key).toBe('score');
    expect(formula.body.data.config.dependencies).toEqual([score.body.data.id]);
  });

  it('reads exact selected custom and composite system records by stable ids', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/base/workspaces')
      .send({ name: `${prefix} 精确回读工作区` })
      .expect(201);
    const table = await request(app.getHttpServer())
      .post(`/api/base/workspaces/${workspace.body.data.id}/tables`)
      .send({ name: `${prefix} 精确回读表` })
      .expect(201);
    const records = await Promise.all(
      ['第一页', '页外已选', '第三条'].map((title) =>
        request(app.getHttpServer())
          .post(`/api/base/tables/${table.body.data.id}/records`)
          .send({ values: { title } })
          .expect(201),
      ),
    );

    await request(app.getHttpServer())
      .get(`/api/base/tables/${table.body.data.id}/records`)
      .query({
        recordIds: `${records[1].body.data.id},${records[0].body.data.id},${records[1].body.data.id}`,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.data.map((record: { id: string }) => record.id)).toEqual([
          records[1].body.data.id,
          records[0].body.data.id,
        ]);
        expect(body.data.meta).toMatchObject({ page: 1, pageSize: 100, total: 2 });
      });

    await request(app.getHttpServer())
      .get(`/api/base/tables/${table.body.data.id}/records`)
      .query({ recordIds: `${records[0].body.data.id},,${records[1].body.data.id}` })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/base/tables/${table.body.data.id}/records`)
      .query({ recordIds: Array.from({ length: 101 }, (_, index) => `record-${index}`).join(',') })
      .expect(400);

    const meeting = await prisma.meeting.create({
      data: { title: `${prefix} 精确会议`, scheduledAt: new Date('2026-07-30T02:00:00.000Z') },
    });
    const action = await prisma.meetingAction.create({
      data: { meetingId: meeting.id, title: `${prefix} 精确行动` },
    });
    const meetingTable = await prisma.dataTable.findFirstOrThrow({
      where: { source: DataTableSource.MEETING_ACTIONS, archivedAt: null },
    });
    await request(app.getHttpServer())
      .get(`/api/base/tables/${meetingTable.id}/records`)
      .query({ recordIds: `ACTION:${action.id},MEETING:${meeting.id}` })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.data.map((record: { id: string }) => record.id)).toEqual([
          `ACTION:${action.id}`,
          `MEETING:${meeting.id}`,
        ]);
      });
  });
});
