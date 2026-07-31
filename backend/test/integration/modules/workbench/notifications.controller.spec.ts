import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Notifications API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-NOTIFICATION-${Date.now()}`;
  let app: INestApplication;
  let authenticated: Awaited<ReturnType<typeof authenticatedRequest>>;

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
    authenticated = await authenticatedRequest(app, prisma, `${prefix}-ROLE`, [
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_UPDATE, dataScope: DataScope.ALL },
    ]);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { sourceId: { startsWith: prefix } } });
    await prisma.reminderRule.deleteMany({ where: { sourceId: { startsWith: prefix } } });
    await prisma.workTask.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.calendarEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.meeting.deleteMany({ where: { id: { startsWith: prefix } } });
    if (authenticated) {
      await prisma.loginAudit.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.user.delete({ where: { id: authenticated.user.id } });
      await prisma.role.delete({ where: { id: authenticated.role.id } });
      await prisma.resourceProfile.delete({ where: { id: authenticated.employee.id } });
    }
    await prisma.$disconnect();
    await app?.close();
  });

  it('returns the unread notification collection contract', async () => {
    const response = await authenticated.agent
      .get('/api/notifications')
      .query({ status: 'UNREAD', page: 1, pageSize: 20 })
      .expect(200);

    expect(response.body.data).toEqual({
      data: expect.any(Array),
      meta: { page: 1, pageSize: 20, total: expect.any(Number) },
    });
  });

  it('marks read, dismisses and snoozes notifications with persisted state', async () => {
    const createNotification = async (suffix: string) => {
      const rule = await prisma.reminderRule.create({
        data: {
          sourceType: 'TASK',
          sourceId: `${prefix}-${suffix}`,
          remindAt: new Date(`2026-08-0${suffix}T01:00:00.000Z`),
          ownerUserId: authenticated.user.id,
        },
      });
      return prisma.notification.create({
        data: {
          reminderRuleId: rule.id,
          title: `${prefix} ${suffix}`,
          body: '提醒内容',
          sourceType: rule.sourceType,
          sourceId: rule.sourceId,
          sourcePath: `/my-work?taskId=${rule.sourceId}`,
          scheduledFor: rule.remindAt,
          triggeredAt: new Date('2026-08-01T01:00:00.000Z'),
        },
      });
    };
    const [readTarget, dismissTarget, snoozeTarget] = await Promise.all([
      createNotification('1'),
      createNotification('2'),
      createNotification('3'),
    ]);

    await authenticated.agent
      .put(`/api/notifications/${readTarget.id}/read`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: readTarget.id, status: 'READ' });
        expect(body.data.readAt).toEqual(expect.any(String));
      });

    await authenticated.agent.delete(`/api/notifications/${dismissTarget.id}`).expect(204);
    await expect(
      prisma.notification.findUniqueOrThrow({ where: { id: dismissTarget.id } }),
    ).resolves.toMatchObject({ status: 'DISMISSED', dismissedAt: expect.any(Date) });

    const snoozeUntil = '2027-08-01T01:00:00.000Z';
    await authenticated.agent
      .put(`/api/notifications/${snoozeTarget.id}/snooze`)
      .send({ snoozeUntil })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: snoozeTarget.id,
          status: 'SNOOZED',
          snoozedUntil: snoozeUntil,
          readAt: null,
          dismissedAt: null,
        });
      });
  });

  it('manages multiple validated reminder rules for every supported source type', async () => {
    const taskId = `${prefix}-task-source`;
    const eventId = `${prefix}-event-source`;
    const meetingId = `${prefix}-meeting-source`;
    await Promise.all([
      prisma.workTask.create({ data: { id: taskId, title: `${prefix} 任务` } }),
      prisma.calendarEvent.create({
        data: {
          id: eventId,
          title: `${prefix} 日程`,
          startAt: new Date('2026-09-01T01:00:00.000Z'),
          endAt: new Date('2026-09-01T02:00:00.000Z'),
        },
      }),
      prisma.meeting.create({
        data: {
          id: meetingId,
          title: `${prefix} 会议`,
          scheduledAt: new Date('2026-09-01T03:00:00.000Z'),
        },
      }),
    ]);

    const createRule = async (sourceType: string, sourceId: string, remindAt: string) => {
      const response = await authenticated.agent
        .post('/api/reminders')
        .send({ sourceType, sourceId, remindAt })
        .expect(201);
      await prisma.reminderRule.update({
        where: { id: response.body.data.id },
        data: { ownerUserId: authenticated.user.id },
      });
      return response;
    };
    const firstTaskRule = (await createRule('TASK', taskId, '2026-08-31T23:00:00.000Z')).body.data;
    const duplicateTaskRule = (await createRule('TASK', taskId, '2026-08-31T23:00:00.000Z')).body
      .data;
    await createRule('TASK', taskId, '2026-08-31T23:30:00.000Z');
    await createRule('CALENDAR_EVENT', eventId, '2026-09-01T00:30:00.000Z');
    await createRule('MEETING', meetingId, '2026-09-01T02:30:00.000Z');

    expect(duplicateTaskRule.id).toBe(firstTaskRule.id);
    await authenticated.agent
      .get('/api/reminders')
      .query({ sourceType: 'TASK', sourceId: taskId })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(2);
      });

    await authenticated.agent.delete(`/api/reminders/${firstTaskRule.id}`).expect(204);
    await authenticated.agent
      .get('/api/reminders')
      .query({ sourceType: 'TASK', sourceId: taskId })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
      });

    await authenticated.agent
      .post('/api/reminders')
      .send({
        sourceType: 'TASK',
        sourceId: 'missing-task',
        remindAt: '2026-09-01T00:00:00.000Z',
      })
      .expect(404);
  });

  it('scans due rules idempotently, tolerates clock rollback and resurfaces snoozes', async () => {
    await prisma.notification.updateMany({
      where: { sourceId: { startsWith: prefix } },
      data: { status: 'DISMISSED', dismissedAt: new Date(), snoozedUntil: null },
    });
    await prisma.reminderRule.updateMany({
      where: { sourceId: { startsWith: prefix } },
      data: { archivedAt: new Date() },
    });
    const taskId = `${prefix}-scheduler-task`;
    await prisma.workTask.upsert({
      where: { id: taskId },
      create: { id: taskId, title: `${prefix} 调度任务` },
      update: { archivedAt: null },
    });
    await prisma.reminderRule.create({
      data: {
        sourceType: 'TASK',
        sourceId: taskId,
        remindAt: new Date('2026-08-01T01:00:00.000Z'),
        ownerUserId: authenticated.user.id,
      },
    });

    const firstScan = await authenticated.agent
      .post('/api/notifications/test/scan')
      .send({ now: '2026-08-01T01:01:00.000Z' })
      .expect(201);
    expect(firstScan.body.data).toMatchObject({ created: 1, resurfaced: 0 });
    expect(firstScan.body.data.notifications).toEqual([
      expect.objectContaining({
        title: `${prefix} 调度任务`,
        body: '任务提醒已到期',
        status: 'UNREAD',
        sourceType: 'TASK',
        sourceId: taskId,
        sourcePath: `/my-work?taskId=${taskId}`,
        triggeredAt: '2026-08-01T01:01:00.000Z',
      }),
    ]);

    await authenticated.agent
      .post('/api/notifications/test/scan')
      .send({ now: '2026-08-01T01:01:00.000Z' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 0, resurfaced: 0, notifications: [] });
      });
    await authenticated.agent
      .post('/api/notifications/test/scan')
      .send({ now: '2026-08-01T00:30:00.000Z' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.created).toBe(0);
      });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { sourceId: taskId },
    });
    const snoozeUntil = '2027-08-01T01:00:00.000Z';
    await authenticated.agent
      .put(`/api/notifications/${notification.id}/snooze`)
      .send({ snoozeUntil })
      .expect(200);
    await authenticated.agent
      .post('/api/notifications/test/scan')
      .send({ now: '2027-08-01T01:01:00.000Z' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 0, resurfaced: 1 });
        expect(body.data.notifications).toEqual([
          expect.objectContaining({
            id: notification.id,
            status: 'UNREAD',
            snoozedUntil: null,
            triggeredAt: '2027-08-01T01:01:00.000Z',
          }),
        ]);
      });
    await expect(prisma.notification.count({ where: { sourceId: taskId } })).resolves.toBe(1);
  });

  it('bridges the existing task reminder API into notifications and deactivates closed tasks', async () => {
    await prisma.notification.updateMany({
      where: { sourceId: { startsWith: prefix } },
      data: { status: 'DISMISSED', dismissedAt: new Date(), snoozedUntil: null },
    });
    await prisma.reminderRule.updateMany({
      where: { sourceId: { startsWith: prefix } },
      data: { archivedAt: new Date() },
    });
    const taskId = `${prefix}-task-reminder-bridge`;
    await prisma.workTask.upsert({
      where: { id: taskId },
      create: { id: taskId, title: `${prefix} 页面提醒任务` },
      update: { status: 'TODO', archivedAt: null },
    });
    const remindAt = '2026-08-02T01:00:00.000Z';

    await authenticated.agent
      .put(`/api/tasks/${taskId}/reminder`)
      .send({ remindAt })
      .expect(200);
    await expect(
      prisma.reminderRule.findFirst({
        where: { sourceType: 'TASK', sourceId: taskId, archivedAt: null },
      }),
    ).resolves.toMatchObject({ remindAt: new Date(remindAt) });
    await prisma.reminderRule.updateMany({
      where: { sourceType: 'TASK', sourceId: taskId },
      data: { ownerUserId: authenticated.user.id },
    });

    await authenticated.agent
      .post('/api/notifications/test/scan')
      .send({ now: '2026-08-02T01:01:00.000Z' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.notifications).toEqual([
          expect.objectContaining({ sourceType: 'TASK', sourceId: taskId, status: 'UNREAD' }),
        ]);
      });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { sourceId: taskId },
    });
    await authenticated.agent
      .put(`/api/notifications/${notification.id}/snooze`)
      .send({ snoozeUntil: '2027-08-02T02:00:00.000Z' })
      .expect(200);

    await authenticated.agent
      .put(`/api/tasks/${taskId}/reminder`)
      .send({ remindAt: '2027-08-02T01:00:00.000Z' })
      .expect(200);
    await prisma.reminderRule.updateMany({
      where: { sourceType: 'TASK', sourceId: taskId },
      data: { ownerUserId: authenticated.user.id },
    });
    await authenticated.agent
      .patch(`/api/tasks/${taskId}`)
      .send({ status: 'DONE' })
      .expect(200);
    await expect(
      Promise.all([
        prisma.taskReminder.count({ where: { taskId } }),
        prisma.reminderRule.count({
          where: { sourceType: 'TASK', sourceId: taskId, archivedAt: null },
        }),
      ]),
    ).resolves.toEqual([0, 0]);
    await authenticated.agent
      .post('/api/notifications/test/scan')
      .send({ now: '2027-08-02T02:01:00.000Z' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 0, resurfaced: 0, notifications: [] });
      });
  });

  it('retires a stale rule instead of notifying for an already completed task', async () => {
    const taskId = `${prefix}-completed-source`;
    await prisma.workTask.upsert({
      where: { id: taskId },
      create: { id: taskId, title: `${prefix} 已完成任务`, status: 'DONE' },
      update: { status: 'DONE', archivedAt: null },
    });
    await authenticated.agent
      .post('/api/reminders')
      .send({
        sourceType: 'TASK',
        sourceId: taskId,
        remindAt: '2026-08-03T01:00:00.000Z',
      })
      .expect(404);
    const rule = await prisma.reminderRule.create({
      data: {
        sourceType: 'TASK',
        sourceId: taskId,
        remindAt: new Date('2026-08-03T01:00:00.000Z'),
      },
    });

    await authenticated.agent
      .post('/api/notifications/test/scan')
      .send({ now: '2026-08-03T01:01:00.000Z' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ created: 0, notifications: [] });
      });
    await expect(
      prisma.reminderRule.findUniqueOrThrow({ where: { id: rule.id } }),
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
  });
});
