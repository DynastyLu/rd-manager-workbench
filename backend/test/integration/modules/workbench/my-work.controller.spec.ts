import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function currentShanghaiDayRange(now = new Date()) {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const start = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      SHANGHAI_OFFSET_MS,
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

describe('My work tasks API', () => {
  const prefix = `TEST-MY-WORK-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let authenticated: Awaited<ReturnType<typeof authenticatedRequest>>;

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
    authenticated = await authenticatedRequest(app, prisma, `${prefix}-ROLE`, [
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_UPDATE, dataScope: DataScope.ALL },
    ]);
  });

  afterAll(async () => {
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    if (authenticated) {
      await prisma.loginAudit.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.rolePermission.deleteMany({ where: { roleId: authenticated.role.id } });
      await prisma.user.delete({ where: { id: authenticated.user.id } });
      await prisma.role.delete({ where: { id: authenticated.role.id } });
      await prisma.resourceProfile.delete({ where: { id: authenticated.employee.id } });
    }
    await prisma.$disconnect();
    await app?.close();
  });

  it('serves all six real views and keeps a future-later task out of today and week', async () => {
    const { start, end } = currentShanghaiDayRange();
    const todayDueAt = new Date(start.getTime() + 12 * 60 * 60 * 1000);
    const inbox = await prisma.workTask.create({ data: { title: `${prefix} inbox` } });
    const today = await prisma.workTask.create({
      data: { title: `${prefix} today`, dueAt: todayDueAt },
    });
    const overdue = await prisma.workTask.create({
      data: { title: `${prefix} overdue`, dueAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    const later = await prisma.workTask.create({
      data: {
        title: `${prefix} later`,
        dueAt: todayDueAt,
        later: { create: { deferredUntil: new Date('2099-01-01T00:00:00.000Z') } },
      },
    });
    const completed = await prisma.workTask.create({
      data: { title: `${prefix} completed`, status: 'DONE' },
    });

    const views = ['INBOX', 'TODAY', 'WEEK', 'OVERDUE', 'LATER', 'COMPLETED'];
    const idsByView: Record<string, string[]> = {};
    for (const view of views) {
      const response = await authenticated.agent.get(`/api/tasks/my-work?view=${view}`);
      if (response.status !== 200) {
        throw new Error(`${view}: ${response.status} ${JSON.stringify(response.body)}`);
      }
      idsByView[view] = response.body.data.data.map(({ id }: { id: string }) => id);
    }

    expect(idsByView.INBOX).toContain(inbox.id);
    expect(idsByView.TODAY).toContain(today.id);
    expect(idsByView.WEEK).toContain(today.id);
    expect(idsByView.OVERDUE).toContain(overdue.id);
    expect(idsByView.LATER).toContain(later.id);
    expect(idsByView.COMPLETED).toContain(completed.id);
    expect(idsByView.TODAY).not.toContain(later.id);
    expect(idsByView.WEEK).not.toContain(later.id);
    expect(todayDueAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(todayDueAt.getTime()).toBeLessThan(end.getTime());
  });

  it('upserts and deletes later/reminder settings and returns them with task responses', async () => {
    const task = await prisma.workTask.create({ data: { title: `${prefix} settings` } });
    const deferredUntil = '2026-07-20T01:00:00.000Z';
    const remindAt = '2026-07-19T01:00:00.000Z';

    await authenticated.agent
      .put(`/api/tasks/${task.id}/later`)
      .send({ deferredUntil })
      .expect(200);
    await authenticated.agent
      .put(`/api/tasks/${task.id}/reminder`)
      .send({ remindAt })
      .expect(200);

    const fetched = await authenticated.agent.get(`/api/tasks/${task.id}`).expect(200);
    expect(fetched.body.data).toMatchObject({
      id: task.id,
      reminder: { taskId: task.id, remindAt },
      later: { taskId: task.id, deferredUntil },
    });

    await authenticated.agent.delete(`/api/tasks/${task.id}/later`).expect(204);
    await authenticated.agent.delete(`/api/tasks/${task.id}/reminder`).expect(204);
    const cleared = await authenticated.agent.get(`/api/tasks/${task.id}`).expect(200);
    expect(cleared.body.data).toMatchObject({ reminder: null, later: null });
  });

  it.each(['DONE', 'CANCELLED'] as const)(
    'clears reminder/later atomically when a task becomes %s and rejects new settings',
    async (status) => {
      const task = await prisma.workTask.create({
        data: {
          title: `${prefix} close ${status}`,
          reminder: { create: { remindAt: new Date('2099-01-01T01:00:00.000Z') } },
          later: { create: { deferredUntil: new Date('2099-01-01T00:00:00.000Z') } },
        },
      });

      const closed = await authenticated.agent
        .patch(`/api/tasks/${task.id}`)
        .send({ status })
        .expect(200);

      expect(closed.body.data).toMatchObject({ status, reminder: null, later: null });
      await expect(
        prisma.taskReminder.count({ where: { taskId: task.id } }),
      ).resolves.toBe(0);
      await expect(prisma.taskLater.count({ where: { taskId: task.id } })).resolves.toBe(0);

      const rejectedLater = await authenticated.agent
        .put(`/api/tasks/${task.id}/later`)
        .send({ deferredUntil: '2099-02-01T00:00:00.000Z' })
        .expect(422);
      const rejectedReminder = await authenticated.agent
        .put(`/api/tasks/${task.id}/reminder`)
        .send({ remindAt: '2099-02-01T01:00:00.000Z' })
        .expect(422);
      expect(rejectedLater.body.error.code).toBe('TASK_INVALID_REFERENCE');
      expect(rejectedReminder.body.error.code).toBe('TASK_INVALID_REFERENCE');

      await authenticated.agent.delete(`/api/tasks/${task.id}/later`).expect(204);
      await authenticated.agent.delete(`/api/tasks/${task.id}/reminder`).expect(204);
    },
  );

  it('validates view and timestamps and rejects settings for an unknown task', async () => {
    await authenticated.agent.get('/api/tasks/my-work?view=UNKNOWN').expect(400);
    await authenticated.agent
      .get('/api/tasks/my-work?view=INBOX&projectId=project-1')
      .expect(200);
    await authenticated.agent.get('/api/tasks/my-work?view=INBOX&projectId=').expect(400);
    await authenticated.agent
      .get(`/api/tasks/my-work?view=INBOX&projectId=${'x'.repeat(192)}`)
      .expect(400);
    await authenticated.agent
      .put('/api/tasks/missing/later')
      .send({ deferredUntil: 'not-a-date' })
      .expect(400);
    await authenticated.agent
      .put('/api/tasks/missing/reminder')
      .send({ remindAt: '2026-07-19T01:00:00.000Z' })
      .expect(404);
  });
});
