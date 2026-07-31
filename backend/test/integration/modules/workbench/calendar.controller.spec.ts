import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Calendar API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-CALENDAR-${Date.now()}`;
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
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.MEETING_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.ALL },
    ]);
  });

  afterAll(async () => {
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.meeting.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: prefix } } });
    if (authenticated) {
      await prisma.loginAudit.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.user.delete({ where: { id: authenticated.user.id } });
      await prisma.role.delete({ where: { id: authenticated.role.id } });
      await prisma.resourceProfile.delete({ where: { id: authenticated.employee.id } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it('returns calendar entries for a valid half-open range', async () => {
    const response = await authenticated.agent
      .get('/api/calendar/entries')
      .query({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' })
      .expect(200);

    expect(response.body.data).toEqual(expect.any(Array));
  });

  it('aggregates persisted events, meetings and task deadlines with source identities', async () => {
    const [event, meeting, task] = await Promise.all([
      prisma.calendarEvent.create({
        data: {
          title: `${prefix} 聚合日程`,
          startAt: new Date('2026-08-03T01:00:00.000Z'),
          endAt: new Date('2026-08-03T02:00:00.000Z'),
        },
      }),
      prisma.meeting.create({
        data: {
          title: `${prefix} 聚合会议`,
          scheduledAt: new Date('2026-08-03T03:00:00.000Z'),
        },
      }),
      prisma.workTask.create({
        data: {
          title: `${prefix} 聚合任务`,
          dueAt: new Date('2026-08-03T04:00:00.000Z'),
        },
      }),
    ]);

    const response = await authenticated.agent
      .get('/api/calendar/entries')
      .query({ from: '2026-08-03T00:00:00.000Z', to: '2026-08-04T00:00:00.000Z' })
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: 'CALENDAR_EVENT', sourceId: event.id }),
        expect.objectContaining({ sourceType: 'MEETING', sourceId: meeting.id }),
        expect.objectContaining({ sourceType: 'TASK', sourceId: task.id }),
      ]),
    );
  });

  it('supports the complete active calendar event lifecycle', async () => {
    const createdResponse = await authenticated.agent
      .post('/api/calendar/events')
      .send({
        title: `${prefix} 面试`,
        startAt: '2026-08-01T02:00:00.000Z',
        endAt: '2026-08-01T03:00:00.000Z',
        type: 'INTERVIEW',
        location: '会议室 A',
      })
      .expect(201);

    expect(createdResponse.body.data).toMatchObject({
      title: `${prefix} 面试`,
      type: 'INTERVIEW',
      allDay: false,
      location: '会议室 A',
    });
    const eventId = createdResponse.body.data.id as string;

    await authenticated.agent
      .get('/api/calendar/events')
      .query({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: eventId })]),
        );
      });

    await authenticated.agent
      .get(`/api/calendar/events/${eventId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(eventId);
      });

    await authenticated.agent
      .patch(`/api/calendar/events/${eventId}`)
      .send({ title: `${prefix} 二面`, endAt: '2026-08-01T04:00:00.000Z' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          title: `${prefix} 二面`,
          endAt: '2026-08-01T04:00:00.000Z',
        });
      });

    await authenticated.agent.delete(`/api/calendar/events/${eventId}`).expect(204);
    await authenticated.agent.get(`/api/calendar/events/${eventId}`).expect(404);
  });

  it('rejects invalid event time ordering with a stable business error', async () => {
    await authenticated.agent
      .post('/api/calendar/events')
      .send({
        title: `${prefix} 无效时间`,
        startAt: '2026-08-01T03:00:00.000Z',
        endAt: '2026-08-01T03:00:00.000Z',
      })
      .expect(422)
      .expect(({ body }) => {
        expect(body.error.code).toBe('CALENDAR_EVENT_TIME_INVALID');
      });
  });

  it('accepts the frontend ordinary calendar type contract', async () => {
    await authenticated.agent
      .post('/api/calendar/events')
      .send({
        title: `${prefix} 专注时间`,
        startAt: '2026-08-01T05:00:00.000Z',
        endAt: '2026-08-01T06:00:00.000Z',
        type: 'FOCUS',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.type).toBe('FOCUS');
      });
  });

  it('rejects a reference to a missing or archived project', async () => {
    await authenticated.agent
      .post('/api/calendar/events')
      .send({
        title: `${prefix} 无效项目`,
        startAt: '2026-08-01T03:00:00.000Z',
        endAt: '2026-08-01T04:00:00.000Z',
        projectId: 'missing-project',
      })
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('PROJECT_NOT_FOUND');
      });
  });

  it('rejects an oversized aggregate range before querying entries', async () => {
    await authenticated.agent
      .get('/api/calendar/entries')
      .query({ from: '2026-01-01T00:00:00.000Z', to: '2027-01-03T00:00:00.000Z' })
      .expect(422)
      .expect(({ body }) => {
        expect(body.error.code).toBe('CALENDAR_RANGE_INVALID');
      });
  });
});
