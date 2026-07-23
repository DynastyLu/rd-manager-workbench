import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Tasks API', () => {
  const prefix = `TEST-TASKS-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let projectId: string;
  let otherProjectId: string;

  const createProject = async (suffix: string) => {
    const project = await prisma.project.create({
      data: { code: `${prefix}-${suffix}`, name: `${prefix}-${suffix}` },
    });
    return project.id;
  };

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
    projectId = await createProject('PRIMARY');
    otherProjectId = await createProject('OTHER');
  });

  afterAll(async () => {
    const standaloneTasks = await prisma.workTask.findMany({
      where: { title: { startsWith: prefix } },
      select: { id: true },
    });
    if (standaloneTasks.length) {
      await prisma.taskDependency.deleteMany({
        where: {
          OR: [
            { taskId: { in: standaloneTasks.map(({ id }) => id) } },
            { dependsOnTaskId: { in: standaloneTasks.map(({ id }) => id) } },
          ],
        },
      });
      await prisma.workTask.deleteMany({
        where: { id: { in: standaloneTasks.map(({ id }) => id) } },
      });
    }
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('creates milestones and progress reports and persists a red health snapshot', async () => {
    const milestone = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/milestones`)
      .send({ name: `${prefix} missed milestone`, status: 'MISSED', isCritical: true })
      .expect(201);

    expect(milestone.body.data).toMatchObject({ projectId, status: 'MISSED' });

    const progress = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/progress-reports`)
      .send({
        summary: `${prefix} progress`,
        completionPercent: 50,
        reportedAt: '2026-07-18T00:00:00.000Z',
      })
      .expect(201);

    expect(progress.body.data).toMatchObject({ projectId, completionPercent: 50 });
    const snapshot = await prisma.projectHealthSnapshot.findFirst({
      where: { projectId },
      orderBy: { calculatedAt: 'desc' },
    });
    expect(snapshot).toMatchObject({ health: 'RED' });
  });

  it('requires every progress report core field', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/progress-reports`)
      .send({ summary: `${prefix} missing reportedAt`, completionPercent: 20 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/progress-reports`)
      .send({ summary: `${prefix} missing completion`, reportedAt: '2026-07-18T00:00:00.000Z' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/progress-reports`)
      .send({ completionPercent: 20, reportedAt: '2026-07-18T00:00:00.000Z' })
      .expect(400);
  });

  it('updates and deletes progress reports within their project scope', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/progress-reports`)
      .send({
        summary: `${prefix} editable progress`,
        completionPercent: 35,
        reportedAt: '2026-07-20T00:00:00.000Z',
      })
      .expect(201);

    const reportId = created.body.data.id;
    const updated = await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/progress-reports/${reportId}`)
      .send({ summary: `${prefix} updated progress`, completionPercent: 70 })
      .expect(200);

    expect(updated.body.data).toMatchObject({
      id: reportId,
      summary: `${prefix} updated progress`,
      completionPercent: 70,
    });
    await request(app.getHttpServer())
      .patch(`/api/projects/${otherProjectId}/progress-reports/${reportId}`)
      .send({ completionPercent: 90 })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/progress-reports/${reportId}`)
      .expect(204);
    expect(await prisma.progressReport.findUnique({ where: { id: reportId } })).toBeNull();
  });

  it('deletes milestones without deleting their work items', async () => {
    const milestone = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/milestones`)
      .send({ name: `${prefix} removable milestone` })
      .expect(201);
    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({
        title: `${prefix} milestone child`,
        projectId,
        milestoneId: milestone.body.data.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/milestones/${milestone.body.data.id}`)
      .expect(204);

    const persistedTask = await prisma.workTask.findUnique({ where: { id: task.body.data.id } });
    expect(persistedTask).toMatchObject({ id: task.body.data.id, milestoneId: null });
  });

  it('persists and validates explicit work-item completion percentages', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} measurable task`, projectId, completionPercent: 25 })
      .expect(201);
    expect(created.body.data.completionPercent).toBe(25);

    const completed = await request(app.getHttpServer())
      .patch(`/api/tasks/${created.body.data.id}`)
      .send({ status: 'DONE', completionPercent: 90 })
      .expect(200);
    expect(completed.body.data.completionPercent).toBe(100);

    await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} invalid percentage`, completionPercent: 101 })
      .expect(400);
  });

  it('rejects a milestone from another project', async () => {
    const milestone = await prisma.milestone.create({
      data: { projectId: otherProjectId, name: `${prefix} foreign milestone` },
    });

    const response = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} mismatch`, projectId, milestoneId: milestone.id })
      .expect(422);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'MILESTONE_PROJECT_MISMATCH' },
    });
  });

  it('timestamps a task created as done and leaves other created tasks incomplete', async () => {
    const completed = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} created done`, projectId, status: 'DONE' })
      .expect(201);
    expect(completed.body.data.completedAt).toEqual(expect.any(String));

    const incomplete = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} created todo`, projectId, status: 'TODO' })
      .expect(201);
    expect(incomplete.body.data.completedAt).toBeNull();
  });

  it('rejects null task and milestone update fields before a milestone task can lose its project', async () => {
    const milestone = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/milestones`)
      .send({ name: `${prefix} null validation milestone` })
      .expect(201);
    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({
        title: `${prefix} null validation task`,
        projectId,
        milestoneId: milestone.body.data.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/tasks/${task.body.data.id}`)
      .send({ projectId: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${task.body.data.id}`)
      .send({ description: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/milestones/${milestone.body.data.id}`)
      .send({ name: null })
      .expect(400);

    const persisted = await request(app.getHttpServer())
      .get(`/api/tasks/${task.body.data.id}`)
      .expect(200);
    expect(persisted.body.data).toMatchObject({ projectId, milestoneId: milestone.body.data.id });
  });

  it('only changes completedAt when task status transitions', async () => {
    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} transition timestamp`, projectId })
      .expect(201);

    const completed = await request(app.getHttpServer())
      .patch(`/api/tasks/${task.body.data.id}`)
      .send({ status: 'DONE' })
      .expect(200);
    expect(completed.body.data.completedAt).toEqual(expect.any(String));

    await new Promise((resolve) => setTimeout(resolve, 5));
    const repeatedDone = await request(app.getHttpServer())
      .patch(`/api/tasks/${task.body.data.id}`)
      .send({ status: 'DONE' })
      .expect(200);
    expect(repeatedDone.body.data.completedAt).toBe(completed.body.data.completedAt);

    const reopened = await request(app.getHttpServer())
      .patch(`/api/tasks/${task.body.data.id}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(reopened.body.data.completedAt).toBeNull();
  });

  it('does not complete a task until all dependencies are done and records completedAt', async () => {
    const prerequisite = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} prerequisite`, projectId })
      .expect(201);
    const dependent = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} dependent`, projectId, dependencyIds: [prerequisite.body.data.id] })
      .expect(201);
    expect(dependent.body.data.dependencyIds).toEqual([prerequisite.body.data.id]);

    const listed = await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${projectId}`)
      .expect(200);
    expect(listed.body.data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: dependent.body.data.id,
          dependencyIds: [prerequisite.body.data.id],
        }),
      ]),
    );
    const projectDetail = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .expect(200);
    expect(projectDetail.body.data.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: dependent.body.data.id,
          dependencyIds: [prerequisite.body.data.id],
        }),
      ]),
    );

    const blocked = await request(app.getHttpServer())
      .patch(`/api/tasks/${dependent.body.data.id}`)
      .send({ status: 'DONE' })
      .expect(422);
    expect(blocked.body).toMatchObject({ error: { code: 'TASK_DEPENDENCY_INCOMPLETE' } });

    await request(app.getHttpServer())
      .patch(`/api/tasks/${prerequisite.body.data.id}`)
      .send({ status: 'DONE' })
      .expect(200);
    const completed = await request(app.getHttpServer())
      .patch(`/api/tasks/${dependent.body.data.id}`)
      .send({ status: 'DONE' })
      .expect(200);
    expect(completed.body.data.completedAt).toEqual(expect.any(String));

    const reopened = await request(app.getHttpServer())
      .patch(`/api/tasks/${dependent.body.data.id}`)
      .send({ status: 'IN_PROGRESS', title: `${prefix} dependent reopened` })
      .expect(200);
    expect(reopened.body.data.completedAt).toBeNull();
    expect(reopened.body.data.title).toBe(`${prefix} dependent reopened`);
  });

  it('rejects dependency cycles', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} cycle first`, projectId })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} cycle second`, projectId, dependencyIds: [first.body.data.id] })
      .expect(201);

    const cycle = await request(app.getHttpServer())
      .patch(`/api/tasks/${first.body.data.id}`)
      .send({ dependencyIds: [second.body.data.id] })
      .expect(422);
    expect(cycle.body).toMatchObject({ error: { code: 'TASK_DEPENDENCY_CYCLE' } });
  });

  it('rejects hierarchical cycles and project moves that would split a task tree', async () => {
    const parent = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} hierarchy parent`, projectId })
      .expect(201);
    const child = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} hierarchy child`, projectId, parentId: parent.body.data.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/tasks/${parent.body.data.id}`)
      .send({ parentId: child.body.data.id })
      .expect(422);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${child.body.data.id}`)
      .send({ projectId: otherProjectId })
      .expect(422);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${parent.body.data.id}`)
      .send({ projectId: otherProjectId })
      .expect(422);
  });

  it('serializes opposing dependency writes so a cycle cannot persist', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} concurrent first`, projectId })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} concurrent second`, projectId })
      .expect(201);

    const [firstWrite, secondWrite] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/tasks/${first.body.data.id}`)
        .send({ dependencyIds: [second.body.data.id] }),
      request(app.getHttpServer())
        .patch(`/api/tasks/${second.body.data.id}`)
        .send({ dependencyIds: [first.body.data.id] }),
    ]);

    expect([firstWrite.status, secondWrite.status].sort()).toEqual([200, 422]);
    expect([firstWrite.body, secondWrite.body]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error: expect.objectContaining({ code: 'TASK_DEPENDENCY_CYCLE' }),
        }),
      ]),
    );
    const edges = await prisma.taskDependency.findMany({
      where: { taskId: { in: [first.body.data.id, second.body.data.id] } },
      select: { taskId: true, dependsOnTaskId: true },
    });
    expect(edges).toHaveLength(1);
  });

  it('keeps the latest health snapshot aligned with final state during concurrent writes', async () => {
    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({
        title: `${prefix} concurrent overdue`,
        projectId: otherProjectId,
        priority: 'CRITICAL',
        dueAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);

    await Promise.all([
      request(app.getHttpServer()).delete(`/api/tasks/${task.body.data.id}`).expect(204),
      request(app.getHttpServer())
        .post(`/api/projects/${otherProjectId}/progress-reports`)
        .send({
          summary: `${prefix} concurrent report`,
          completionPercent: 75,
          reportedAt: '2026-07-18T00:00:00.000Z',
        })
        .expect(201),
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/api/projects/${otherProjectId}`)
      .expect(200);
    expect(detail.body.data.latestHealthSnapshot).toMatchObject({ health: 'GREEN' });
  });

  it('marks a project red for an overdue critical task and excludes archived tasks from lists', async () => {
    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({
        title: `${prefix} overdue critical`,
        projectId: otherProjectId,
        priority: 'CRITICAL',
        dueAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);

    const snapshot = await prisma.projectHealthSnapshot.findFirst({
      where: { projectId: otherProjectId },
      orderBy: { calculatedAt: 'desc' },
    });
    expect(snapshot).toMatchObject({ health: 'RED' });

    await request(app.getHttpServer()).delete(`/api/tasks/${task.body.data.id}`).expect(204);
    const list = await request(app.getHttpServer())
      .get(`/api/tasks?projectId=${otherProjectId}&page=1&pageSize=100`)
      .expect(200);
    expect(list.body.data.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: task.body.data.id })]),
    );
  });

  it('rejects unknown and null task fields', async () => {
    await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} invalid`, description: null, unknown: true })
      .expect(400);
  });
});
