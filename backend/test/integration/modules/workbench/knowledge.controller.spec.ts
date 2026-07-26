import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('KnowledgeController (integration)', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-KNOWLEDGE-${Date.now()}`;
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await prisma.knowledgeMessage.deleteMany({
      where: { session: { title: { startsWith: prefix } } },
    });
    await prisma.knowledgeSession.deleteMany({
      where: { title: { startsWith: prefix } },
    });
    await prisma.$disconnect();
    await app?.close();
  });

  it('POST /api/knowledge/sessions - should create a session with a question and return 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/knowledge/sessions')
      .send({ question: `${prefix} 什么是微服务架构？` })
      .expect(201);

    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
    });
    expect(res.body.data.title).toContain(prefix);
  });

  it('GET /api/knowledge/sessions - should list active sessions including the created one', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/knowledge/sessions')
      .send({ question: `${prefix} 如何实现分布式事务？` })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/knowledge/sessions')
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.data.id,
          title: expect.any(String),
          status: 'ACTIVE',
        }),
      ]),
    );
  });

  it('GET /api/knowledge/sessions/:id - should get session detail with messages', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/knowledge/sessions')
      .send({ question: `${prefix} Kubernetes最佳实践` })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/knowledge/sessions/${created.body.data.id}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      id: created.body.data.id,
      title: expect.any(String),
      messages: expect.any(Array),
    });
  });

  it('DELETE /api/knowledge/sessions/:id - should archive a session and return 204', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/knowledge/sessions')
      .send({ question: `${prefix} 临时查询会话` })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/knowledge/sessions/${created.body.data.id}`)
      .expect(204);
  });

  it('GET /api/knowledge/reindex/status - should return indexing status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/knowledge/reindex/status')
      .expect(200);

    expect(res.body).toHaveProperty('data');
  });

  it('GET /api/knowledge/usage - should return usage statistics with expected time buckets', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/knowledge/usage')
      .expect(200);

    expect(res.body.data).toMatchObject({
      today: expect.any(Object),
      week: expect.any(Object),
      month: expect.any(Object),
      total: expect.any(Object),
    });
  });
});
