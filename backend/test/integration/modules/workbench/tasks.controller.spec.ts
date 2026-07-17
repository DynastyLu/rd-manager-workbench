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

  it('does not complete a task until all dependencies are done and records completedAt', async () => {
    const prerequisite = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} prerequisite`, projectId })
      .expect(201);
    const dependent = await request(app.getHttpServer())
      .post('/api/tasks')
      .send({ title: `${prefix} dependent`, projectId, dependencyIds: [prerequisite.body.data.id] })
      .expect(201);

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
