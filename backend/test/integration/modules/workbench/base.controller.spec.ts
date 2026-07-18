import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataTableSource, PrismaClient } from '@prisma/client';
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
  });

  afterAll(async () => {
    const workspaces = await prisma.dataWorkspace.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } });
    const workspaceIds = workspaces.map(({ id }) => id);
    const tables = await prisma.dataTable.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
    const tableIds = tables.map(({ id }) => id);
    await prisma.dataRecord.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.dataView.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.dataField.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.dataTable.deleteMany({ where: { id: { in: tableIds } } });
    await prisma.dataWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.meetingAction.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.meeting.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('creates the default workspace and five presets idempotently under concurrency', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(app.getHttpServer()).get('/api/base/workspaces').expect(200)));
    for (const response of responses) {
      const workspace = response.body.data.find((item: { name: string }) => item.name === '研发工作台');
      expect(workspace.tables).toHaveLength(5);
      expect(workspace.tables.map((table: { source: string }) => table.source)).toEqual(expect.arrayContaining([
        'PROJECTS', 'WORK_TASKS', 'MEETING_ACTIONS', 'DOCUMENTS', 'RISKS_DECISIONS',
      ]));
    }
    await expect(prisma.dataWorkspace.count({ where: { id: 'rd-workbench-default-data-workspace' } })).resolves.toBe(1);
    await expect(prisma.dataTable.count({ where: { presetKey: { not: null } } })).resolves.toBe(5);
  });

  it('supports custom table, field, record and view CRUD with field validation', async () => {
    const workspace = await request(app.getHttpServer()).post('/api/base/workspaces').send({ name: `${prefix} 工作区` }).expect(201);
    const table = await request(app.getHttpServer()).post(`/api/base/workspaces/${workspace.body.data.id}/tables`).send({ name: `${prefix} 需求池` }).expect(201);
    const tableId = table.body.data.id as string;
    const numberField = await request(app.getHttpServer()).post(`/api/base/tables/${tableId}/fields`).send({ key: 'estimate', name: '工时', type: 'NUMBER', isRequired: true, sequence: 1 }).expect(201);

    await request(app.getHttpServer()).get(`/api/base/tables/${tableId}/records`).query({ sortOrder: 'sideways' }).expect(400);

    await request(app.getHttpServer()).post(`/api/base/tables/${tableId}/records`).send({ values: { title: '任务 A', estimate: 'three' } }).expect(400);
    await request(app.getHttpServer()).post(`/api/base/tables/${tableId}/records`).send({ values: { title: '任务 A', estimate: 3, unexpected: true } }).expect(400);
    const record = await request(app.getHttpServer()).post(`/api/base/tables/${tableId}/records`).send({ values: { title: '任务 A', estimate: 3 } }).expect(201);
    expect(record.body.data).toMatchObject({ values: { title: '任务 A', estimate: 3 }, sourceType: 'CUSTOM' });

    await request(app.getHttpServer()).patch(`/api/base/tables/${tableId}/records/${record.body.data.id}`).send({ values: { estimate: 5 } }).expect(200);
    const view = await request(app.getHttpServer()).post(`/api/base/tables/${tableId}/views`).send({ name: '工时看板', type: 'KANBAN', config: { groupField: 'estimate' } }).expect(201);
    await request(app.getHttpServer()).patch(`/api/base/views/${view.body.data.id}`).send({ name: '排期看板', isDefault: true }).expect(200);
    await request(app.getHttpServer()).delete(`/api/base/fields/${numberField.body.data.id}`).expect(204);
    await request(app.getHttpServer()).get(`/api/base/tables/${tableId}/records`).expect(200).expect(({ body }) => expect(body.data.data[0].values).toEqual({ title: '任务 A' }));
    await request(app.getHttpServer()).delete(`/api/base/views/${view.body.data.id}`).expect(204);
  });

  it('updates a preset task through TasksService so completion clears reminders', async () => {
    const task = await prisma.workTask.create({ data: { title: `${prefix} 联动任务`, dueAt: new Date('2026-07-25T01:00:00.000Z') } });
    await prisma.taskReminder.create({ data: { taskId: task.id, remindAt: new Date('2026-07-24T01:00:00.000Z') } });
    const table = await prisma.dataTable.findFirstOrThrow({ where: { source: DataTableSource.WORK_TASKS, archivedAt: null } });
    await request(app.getHttpServer()).patch(`/api/base/tables/${table.id}/records/${task.id}`).send({ values: { unexpected: true } }).expect(400);
    await request(app.getHttpServer()).patch(`/api/base/tables/${table.id}/records/${task.id}`).send({ values: { status: 'DONE', dueAt: '2026-07-26T01:00:00.000Z' } }).expect(200).expect(({ body }) => {
      expect(body.data).toMatchObject({ id: task.id, sourcePath: `/my-work?taskId=${task.id}`, values: { status: 'DONE' } });
    });
    await expect(prisma.workTask.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ status: 'DONE', dueAt: new Date('2026-07-26T01:00:00.000Z') });
    await expect(prisma.taskReminder.count({ where: { taskId: task.id } })).resolves.toBe(0);
  });

  it('projects both meetings and actions into one preset without copies', async () => {
    const meeting = await prisma.meeting.create({ data: { title: `${prefix} 评审会`, scheduledAt: new Date('2026-07-27T02:00:00.000Z') } });
    const action = await prisma.meetingAction.create({ data: { meetingId: meeting.id, title: `${prefix} 修订方案` } });
    const table = await prisma.dataTable.findFirstOrThrow({ where: { source: DataTableSource.MEETING_ACTIONS, archivedAt: null } });
    await request(app.getHttpServer()).get(`/api/base/tables/${table.id}/records`).query({ query: prefix }).expect(200).expect(({ body }) => {
      expect(body.data.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: `MEETING:${meeting.id}`, values: expect.objectContaining({ recordType: 'MEETING' }) }),
        expect.objectContaining({ id: `ACTION:${action.id}`, values: expect.objectContaining({ recordType: 'ACTION' }) }),
      ]));
    });
    await expect(prisma.dataRecord.count({ where: { tableId: table.id } })).resolves.toBe(0);
  });
});
