import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('administrator security-audit API', () => {
  const prisma = new PrismaClient();
  const prefix = `iam-audit-${randomUUID()}`.toLowerCase();
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employee: Awaited<ReturnType<typeof authenticatedRequest>>;

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();

    admin = await authenticatedRequest(app, prisma, 'SUPER_ADMIN');
    employee = await authenticatedRequest(app, prisma, 'EMPLOYEE');
    await prisma.role.updateMany({
      where: { code: { in: ['SUPER_ADMIN', 'EMPLOYEE'] } },
      data: { isSystem: true, isEnabled: true },
    });
  });

  afterAll(async () => {
    try {
      const fixtureUsers = [admin?.user.id, employee?.user.id].filter(
        (id): id is string => Boolean(id),
      );
      if (fixtureUsers.length > 0) {
        await prisma.authSession.deleteMany({ where: { userId: { in: fixtureUsers } } });
        await prisma.loginAudit.deleteMany({
          where: {
            OR: [
              { userId: { in: fixtureUsers } },
              { username: { startsWith: prefix } },
            ],
          },
        });
        await prisma.userRole.deleteMany({
          where: {
            OR: [
              { userId: { in: fixtureUsers } },
              { assignedByUserId: { in: fixtureUsers } },
            ],
          },
        });
        await prisma.user.deleteMany({ where: { id: { in: fixtureUsers } } });
      } else {
        await prisma.loginAudit.deleteMany({ where: { username: { startsWith: prefix } } });
      }
      const fixtureEmployees = [admin?.employee.id, employee?.employee.id].filter(
        (id): id is string => Boolean(id),
      );
      if (fixtureEmployees.length > 0) {
        await prisma.resourceProfile.deleteMany({ where: { id: { in: fixtureEmployees } } });
      }
    } finally {
      await prisma.$disconnect();
      await app?.close();
    }
  });

  it('requires audit.read and rejects an ordinary employee', async () => {
    await employee.agent
      .get('/api/admin/security-audits')
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('PERMISSION_DENIED'));
  });

  it('filters security events and returns stable newest-first pagination without secrets', async () => {
    const username = `${prefix}-subject`;
    const now = Date.now();
    await prisma.loginAudit.createMany({
      data: [
        {
          userId: admin.user.id,
          username,
          eventType: 'USER_PASSWORD_RESET',
          success: true,
          failureReason: null,
          ipAddress: '127.0.0.7',
          userAgent: 'task7-agent-oldest',
          occurredAt: new Date(now - 3_000),
        },
        {
          userId: admin.user.id,
          username,
          eventType: 'USER_PASSWORD_RESET',
          success: false,
          failureReason: 'POLICY_REJECTED',
          ipAddress: '127.0.0.8',
          userAgent: 'task7-agent-middle',
          occurredAt: new Date(now - 2_000),
        },
        {
          userId: admin.user.id,
          username,
          eventType: 'USER_PASSWORD_RESET',
          success: true,
          failureReason: null,
          ipAddress: '127.0.0.9',
          userAgent: 'task7-agent-newest',
          occurredAt: new Date(now - 1_000),
        },
        {
          userId: admin.user.id,
          username,
          eventType: 'LOGIN',
          success: true,
          occurredAt: new Date(now),
        },
      ],
    });

    await admin.agent
      .get('/api/admin/security-audits')
      .query({
        page: 1,
        pageSize: 2,
        username,
        eventType: 'USER_PASSWORD_RESET',
        from: new Date(now - 10_000).toISOString(),
        to: new Date(now + 10_000).toISOString(),
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
        expect(body.data.data).toHaveLength(2);
        expect(body.data.data.map(({ userAgent }: { userAgent: string }) => userAgent)).toEqual([
          'task7-agent-newest',
          'task7-agent-middle',
        ]);
        for (const audit of body.data.data as Array<Record<string, unknown>>) {
          expect(audit).not.toHaveProperty('password');
          expect(audit).not.toHaveProperty('passwordHash');
          expect(audit).not.toHaveProperty('accessToken');
          expect(audit).not.toHaveProperty('refreshToken');
          expect(audit).not.toHaveProperty('refreshTokenHash');
        }
      });

    await admin.agent
      .get('/api/admin/security-audits')
      .query({
        page: 2,
        pageSize: 2,
        username,
        eventType: 'USER_PASSWORD_RESET',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
        expect(body.data.data).toEqual([
          expect.objectContaining({ userAgent: 'task7-agent-oldest' }),
        ]);
      });
  });

  it('filters by actor user, outcome and exact event type', async () => {
    const username = `${prefix}-outcome`;
    await prisma.loginAudit.createMany({
      data: [
        {
          userId: admin.user.id,
          username,
          eventType: 'USER_DISABLED',
          success: true,
        },
        {
          userId: admin.user.id,
          username,
          eventType: 'USER_DISABLED',
          success: false,
          failureReason: 'LAST_SUPER_ADMIN',
        },
        {
          userId: employee.user.id,
          username,
          eventType: 'USER_DISABLED',
          success: false,
          failureReason: 'PERMISSION_DENIED',
        },
      ],
    });

    await admin.agent
      .get('/api/admin/security-audits')
      .query({
        userId: admin.user.id,
        eventType: 'USER_DISABLED',
        success: false,
        username,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta.total).toBe(1);
        expect(body.data.data).toEqual([
          expect.objectContaining({
            userId: admin.user.id,
            eventType: 'USER_DISABLED',
            success: false,
            failureReason: 'LAST_SUPER_ADMIN',
          }),
        ]);
      });
  });

  it('validates pagination and date ranges instead of accepting unbounded audit queries', async () => {
    await admin.agent
      .get('/api/admin/security-audits')
      .query({ page: 0, pageSize: 1000 })
      .expect(400);
    await admin.agent
      .get('/api/admin/security-audits')
      .query({
        from: '2026-08-02T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AUDIT_RANGE_INVALID');
      });
  });
});
