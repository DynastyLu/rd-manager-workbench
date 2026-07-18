import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

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
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('serves all six real views and keeps a future-later task out of today and week', async () => {
    const { start, end } = currentShanghaiDayRange();
    const todayDueAt = new Date(start.getTime() + 12 * 60 * 60 * 1000);
    const [inbox, today, overdue, later, completed] = await Promise.all([
      prisma.workTask.create({ data: { title: `${prefix} inbox` } }),
      prisma.workTask.create({ data: { title: `${prefix} today`, dueAt: todayDueAt } }),
      prisma.workTask.create({
        data: { title: `${prefix} overdue`, dueAt: new Date('2020-01-01T00:00:00.000Z') },
      }),
      prisma.workTask.create({
        data: {
          title: `${prefix} later`,
          dueAt: todayDueAt,
          later: { create: { deferredUntil: new Date('2099-01-01T00:00:00.000Z') } },
        },
      }),
      prisma.workTask.create({ data: { title: `${prefix} completed`, status: 'DONE' } }),
    ]);

    const views = ['INBOX', 'TODAY', 'WEEK', 'OVERDUE', 'LATER', 'COMPLETED'];
    const idsByView: Record<string, string[]> = {};
    for (const view of views) {
      const response = await request(app.getHttpServer()).get(`/api/tasks/my-work?view=${view}`);
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

    await request(app.getHttpServer())
      .put(`/api/tasks/${task.id}/later`)
      .send({ deferredUntil })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/tasks/${task.id}/reminder`)
      .send({ remindAt })
      .expect(200);

    const fetched = await request(app.getHttpServer()).get(`/api/tasks/${task.id}`).expect(200);
    expect(fetched.body.data).toMatchObject({
      id: task.id,
      reminder: { taskId: task.id, remindAt },
      later: { taskId: task.id, deferredUntil },
    });

    await request(app.getHttpServer()).delete(`/api/tasks/${task.id}/later`).expect(204);
    await request(app.getHttpServer()).delete(`/api/tasks/${task.id}/reminder`).expect(204);
    const cleared = await request(app.getHttpServer()).get(`/api/tasks/${task.id}`).expect(200);
    expect(cleared.body.data).toMatchObject({ reminder: null, later: null });
  });

  it('validates view and timestamps and rejects settings for an unknown task', async () => {
    await request(app.getHttpServer()).get('/api/tasks/my-work?view=UNKNOWN').expect(400);
    await request(app.getHttpServer())
      .get('/api/tasks/my-work?view=INBOX&projectId=project-1')
      .expect(200);
    await request(app.getHttpServer()).get('/api/tasks/my-work?view=INBOX&projectId=').expect(400);
    await request(app.getHttpServer())
      .get(`/api/tasks/my-work?view=INBOX&projectId=${'x'.repeat(192)}`)
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/tasks/missing/later')
      .send({ deferredUntil: 'not-a-date' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/tasks/missing/reminder')
      .send({ remindAt: '2026-07-19T01:00:00.000Z' })
      .expect(404);
  });
});
