import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Employee work import authorization', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-EMPLOYEE-IMPORT-AUTH-${Date.now()}`;
  let app: INestApplication;
  const fixtures: Array<Awaited<ReturnType<typeof authenticatedRequest>>> = [];

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
    try {
      for (const fixture of fixtures.reverse()) {
        await prisma.loginAudit.deleteMany({ where: { userId: fixture.user.id } });
        await prisma.authSession.deleteMany({ where: { userId: fixture.user.id } });
        await prisma.userRole.deleteMany({ where: { userId: fixture.user.id } });
        await prisma.user.deleteMany({ where: { id: fixture.user.id } });
        await prisma.role.deleteMany({ where: { id: fixture.role.id } });
        await prisma.resourceProfile.deleteMany({ where: { id: fixture.employee.id } });
      }
    } finally {
      await prisma.$disconnect();
      await app?.close();
    }
  });

  it('rejects a request without the required permission code', async () => {
    const fixture = await createFixture('NO-PERMISSION');

    await fixture.agent.get('/api/employee-work-imports/template').expect(403);
    await fixture.agent.get('/api/employee-work-imports').expect(403);
  });

  it.each(['SELF', 'INVOLVED'] as const)(
    'rejects batch mutation when employee.update is limited to %s',
    async (dataScope) => {
      const fixture = await createFixture(`UPDATE-${dataScope}`, [
        { code: 'employee.update', dataScope },
      ]);

      await fixture.agent.post('/api/employee-work-imports').expect(403);
    },
  );

  it('rejects scoped readers before UUID pipes run', async () => {
    const fixture = await createFixture('READ-SELF-INVALID-ID', [
      { code: 'employee.read', dataScope: 'SELF' },
    ]);

    await fixture.agent
      .get('/api/employee-work-imports/not-a-uuid')
      .set('User-Agent', 'employee-import-auth-test')
      .expect(403)
      .expect(({ body }) => {
        expect(body.error).toEqual(
          expect.objectContaining({
            code: 'PERMISSION_DENIED',
            message: 'Permission denied',
            details: { requiredPermissions: ['employee.read'] },
          }),
        );
      });

    const audit = await prisma.loginAudit.findFirstOrThrow({
      where: { userId: fixture.user.id, eventType: 'PERMISSION_DENIED' },
      orderBy: { occurredAt: 'desc' },
    });
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId: fixture.user.id },
      select: { id: true },
    });
    expect(audit).toEqual(
      expect.objectContaining({
        success: false,
        failureReason: 'employee.read',
        userAgent: 'employee-import-auth-test',
        sessionId: session.id,
      }),
    );
    expect(audit.ipAddress).toBeTruthy();
  });

  it('rejects scoped readers from every batch download endpoint', async () => {
    const fixture = await createFixture('READ-SELF-DOWNLOADS', [
      { code: 'employee.read', dataScope: 'SELF' },
    ]);
    const id = randomUUID();

    for (const path of [`${id}/errors`, `${id}/source`]) {
      await fixture.agent
        .get(`/api/employee-work-imports/${path}`)
        .expect(403)
        .expect(({ body }) => expect(body.error.code).toBe('PERMISSION_DENIED'));
    }
  });

  it('rejects scoped mutations before UUID and DTO pipes run', async () => {
    const fixture = await createFixture('UPDATE-INVOLVED-INVALID-INPUT', [
      { code: 'employee.update', dataScope: 'INVOLVED' },
    ]);

    await fixture.agent
      .patch('/api/employee-work-imports/not-a-uuid/resolutions')
      .send({ unexpected: true })
      .expect(403);
  });

  it('rejects scoped upload requests before the upload interceptor reaches the handler', async () => {
    const fixture = await createFixture('UPDATE-SELF-UPLOAD', [
      { code: 'employee.update', dataScope: 'SELF' },
    ]);

    await fixture.agent
      .post('/api/employee-work-imports')
      .attach('file', Buffer.from('not-an-xlsx'), {
        filename: 'blocked.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(403);
  });

  it('rejects scoped mutations from every sensitive batch action', async () => {
    const fixture = await createFixture('UPDATE-SELF-ACTIONS', [
      { code: 'employee.update', dataScope: 'SELF' },
    ]);
    const id = randomUUID();
    const requestActions = [
      () => fixture.agent.patch(`/api/employee-work-imports/${id}/preview`).send({}),
      () => fixture.agent.post(`/api/employee-work-imports/${id}/commit`).send({}),
      () => fixture.agent.post(`/api/employee-work-imports/${id}/restore`).send({}),
      () => fixture.agent.post(`/api/employee-work-imports/${id}/rebuild-snapshots`).send({}),
    ];

    for (const requestAction of requestActions) {
      await requestAction()
        .expect(403)
        .expect(({ body }) => expect(body.error.code).toBe('PERMISSION_DENIED'));
    }
  });

  it('allows ALL-scoped readers and mutations to reach existing business validation', async () => {
    const fixture = await createFixture('ALL', [
      { code: 'employee.read', dataScope: 'ALL' },
      { code: 'employee.update', dataScope: 'ALL' },
      { code: 'employee.delete', dataScope: 'ALL' },
    ]);

    await fixture.agent.get('/api/employee-work-imports').expect(200);
    await fixture.agent.post('/api/employee-work-imports').expect(422);
    await fixture.agent.delete(`/api/employee-work-imports/${randomUUID()}`).expect(404);
  });

  it('rejects employee.delete without ALL scope', async () => {
    const fixture = await createFixture('DELETE-SELF', [
      { code: 'employee.delete', dataScope: 'SELF' },
    ]);

    await fixture.agent.delete(`/api/employee-work-imports/${randomUUID()}`).expect(403);
  });

  it('rejects scoped deletes before UUID pipes run', async () => {
    const fixture = await createFixture('DELETE-SELF-INVALID-ID', [
      { code: 'employee.delete', dataScope: 'SELF' },
    ]);

    await fixture.agent.delete('/api/employee-work-imports/not-a-uuid').expect(403);
  });

  async function createFixture(
    suffix: string,
    permissions: Parameters<typeof authenticatedRequest>[3] = [],
  ) {
    const fixture = await authenticatedRequest(
      app,
      prisma,
      `${prefix}-${suffix}`,
      permissions,
    );
    fixtures.push(fixture);
    return fixture;
  }
});
