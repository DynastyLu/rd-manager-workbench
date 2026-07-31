import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

jest.setTimeout(30_000);

describe('Extensions profile and run API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-EXT-${Date.now()}`;
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
    authenticated = await authenticatedRequest(app, prisma, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    await prisma.extensionRun.deleteMany({ where: { profile: { name: { startsWith: prefix } } } });
    await prisma.extensionProfile.deleteMany({ where: { name: { startsWith: prefix } } });
    if (authenticated) {
      await prisma.loginAudit.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.user.delete({ where: { id: authenticated.user.id } });
      await prisma.role.delete({ where: { id: authenticated.role.id } });
      await prisma.resourceProfile.delete({ where: { id: authenticated.employee.id } });
    }
    await prisma.$disconnect();
    if (app) await app.close();
  });

  it('rejects secret-looking public config recursively and validates providers', async () => {
    await authenticated.agent
      .post('/api/extensions/profiles')
      .send({
        kind: 'SMS',
        provider: 'LOCAL_PREVIEW',
        name: `${prefix} secret`,
        publicConfig: { templates: { REMINDER: 'SMS_LOCAL' }, nested: { apiKey: 'leak' } },
      })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('EXTENSION_SECRET_IN_CONFIG'));

    await authenticated.agent
      .post('/api/extensions/profiles')
      .send({
        kind: 'SMS',
        provider: 'OPENAI_RESPONSES',
        name: `${prefix} mismatch`,
        publicConfig: { model: 'gpt-5.6-sol' },
      })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('EXTENSION_CONFIG_INVALID'));

    await authenticated.agent
      .post('/api/extensions/profiles')
      .send({
        kind: 'AI',
        provider: 'OPENAI_RESPONSES',
        name: `${prefix} no credential`,
        enabled: true,
        publicConfig: { model: 'gpt-5.6-sol' },
      })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('CREDENTIAL_NOT_FOUND'));

    await authenticated.agent
      .post('/api/extensions/profiles')
      .send({
        kind: 'CLOUD_DRIVE',
        provider: 'WEBDAV',
        name: `${prefix} hostile root`,
        publicConfig: { baseUrl: 'https://dav.example.com', remoteRoot: '//evil.example/files' },
      })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('EXTERNAL_PATH_INVALID'));

    await authenticated.agent
      .post('/api/extensions/profiles')
      .send({
        kind: 'CALENDAR',
        provider: 'CALDAV',
        name: `${prefix} hostile calendar`,
        publicConfig: { baseUrl: 'https://dav.example.com', calendarPath: '//evil.example/calendar', syncDirection: 'PULL_ONLY' },
      })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('EXTERNAL_PATH_INVALID'));
  });

  it('creates profiles and keeps local preview explicitly rejected', async () => {
    const profile = (
      await authenticated.agent
        .post('/api/extensions/profiles')
        .send({
          kind: 'SMS',
          provider: 'LOCAL_PREVIEW',
          name: `${prefix} sms preview`,
          enabled: true,
          publicConfig: { templateMapping: { IMPORTANT_REMINDER: 'LOCAL_REMINDER' } },
          permissions: ['SMS_PREVIEW'],
        })
        .expect(201)
    ).body.data;
    expect(profile).toMatchObject({ provider: 'LOCAL_PREVIEW', enabled: true });

    const prepared = (
      await authenticated.agent
        .post(`/api/extensions/profiles/${profile.id}/runs/prepare`)
        .send({
          operation: 'SMS_PREVIEW',
          payload: { recipientId: 'recipient-1', templateKey: 'IMPORTANT_REMINDER' },
        })
        .expect(201)
    ).body.data;
    expect(prepared).toMatchObject({ requiresConfirmation: true, inputBytes: expect.any(Number) });

    await authenticated.agent
      .post(`/api/extensions/profiles/${profile.id}/runs`)
      .send({
        operation: 'SMS_PREVIEW',
        payload: { recipientId: 'recipient-1', templateKey: 'IMPORTANT_REMINDER' },
        confirmationHash: '0'.repeat(64),
      })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('EXTENSION_CONFIRMATION_REQUIRED'));

    const preview = (
      await authenticated.agent
        .post(`/api/extensions/profiles/${profile.id}/runs`)
        .send({
          operation: 'SMS_PREVIEW',
          payload: { recipientId: 'recipient-1', templateKey: 'IMPORTANT_REMINDER' },
          confirmationHash: prepared.confirmationHash,
        })
        .expect(201)
    ).body.data;
    expect(preview).toMatchObject({ status: 'REJECTED', errorCode: 'PREVIEW_ONLY' });
    expect(preview).not.toHaveProperty('completionToken');
  });

  it('uses a one-time completion token, payload hash and body-free run record', async () => {
    const profile = (
      await authenticated.agent
        .post('/api/extensions/profiles')
        .send({
          kind: 'AI',
          provider: 'LOCAL_MANUAL',
          name: `${prefix} manual AI`,
          enabled: true,
          publicConfig: { model: 'manual' },
          permissions: ['AI_KNOWLEDGE_QA'],
        })
        .expect(201)
    ).body.data;
    const payload = { objectIds: ['doc-1'], citationIds: ['doc-1'], context: 'private text never stored' };
    const prepared = (
      await authenticated.agent
        .post(`/api/extensions/profiles/${profile.id}/runs/prepare`)
        .send({ operation: 'AI_KNOWLEDGE_QA', payload })
        .expect(201)
    ).body.data;
    const started = (
      await authenticated.agent
        .post(`/api/extensions/profiles/${profile.id}/runs`)
        .send({ operation: 'AI_KNOWLEDGE_QA', payload, confirmationHash: prepared.confirmationHash })
        .expect(201)
    ).body.data;
    expect(started).toMatchObject({ status: 'RUNNING', completionToken: expect.any(String) });

    const output = { answer: 'manual answer', citations: ['doc-1'] };
    await authenticated.agent
      .post(`/api/extensions/runs/${started.id}/complete`)
      .send({ completionToken: 'wrong-token', status: 'SUCCEEDED', output })
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe('EXTENSION_RUN_TOKEN_INVALID'));

    const completed = (
      await authenticated.agent
        .post(`/api/extensions/runs/${started.id}/complete`)
        .send({ completionToken: started.completionToken, status: 'SUCCEEDED', output })
        .expect(201)
    ).body.data;
    expect(completed).toMatchObject({ status: 'SUCCEEDED', outputBytes: expect.any(Number) });
    expect(completed).not.toHaveProperty('completionTokenHash');

    await authenticated.agent
      .post(`/api/extensions/runs/${started.id}/complete`)
      .send({ completionToken: started.completionToken, status: 'SUCCEEDED', output })
      .expect(201)
      .expect(({ body }) => expect(body.data.id).toBe(started.id));

    await authenticated.agent
      .post(`/api/extensions/runs/${started.id}/complete`)
      .send({ completionToken: 'wrong-token', status: 'SUCCEEDED', output })
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe('EXTENSION_RUN_TOKEN_INVALID'));

    const stored = await prisma.extensionRun.findUniqueOrThrow({ where: { id: started.id } });
    expect(stored.metadata).toEqual(expect.objectContaining({ objectIds: ['doc-1'] }));
    expect(JSON.stringify(stored)).not.toContain('private text never stored');
    expect(JSON.stringify(stored)).not.toContain('manual answer');
    expect(stored.completionTokenHash).toBeNull();
    expect(stored.completionReceiptHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
