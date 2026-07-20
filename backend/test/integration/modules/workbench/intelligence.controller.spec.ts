import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, ProjectStatus } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Intelligence catalog API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-INTEL-${Date.now()}`;
  let app: INestApplication;
  let projectId = '';

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
    projectId = (
      await prisma.project.create({
        data: { code: `${prefix}-PROJECT`, name: `${prefix} project`, status: ProjectStatus.ACTIVE },
      })
    ).id;
  });

  afterAll(async () => {
    const intelligenceItems = await prisma.intelligenceItem.findMany({
      where: { title: { startsWith: prefix } },
      select: { id: true },
    });
    const itemIds = intelligenceItems.map(({ id }) => id);
    if (itemIds.length) {
      const conversions = await prisma.intelligenceConversion.findMany({
        where: { itemId: { in: itemIds } },
      });
      const briefIds = (
        await prisma.intelligenceBriefItem.findMany({
          where: { itemId: { in: itemIds } },
          select: { briefId: true },
        })
      ).map(({ briefId }) => briefId);
      await prisma.intelligenceBriefItem.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.intelligenceBrief.deleteMany({ where: { id: { in: briefIds } } });
      await prisma.intelligenceConversion.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.workTask.deleteMany({
        where: { id: { in: conversions.filter(({ kind }) => kind === 'TASK').map(({ targetId }) => targetId) } },
      });
      await prisma.contentDocument.deleteMany({
        where: { id: { in: conversions.filter(({ kind }) => kind === 'KNOWLEDGE').map(({ targetId }) => targetId) } },
      });
      await prisma.intelligenceOccurrence.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.intelligenceItemTopic.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.intelligenceItemProject.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.intelligenceItem.deleteMany({ where: { id: { in: itemIds } } });
    }
    await prisma.intelligenceRun.deleteMany({ where: { plan: { name: { startsWith: prefix } } } });
    await prisma.intelligenceCollectionPlan.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.intelligenceTopicProject.deleteMany({ where: { topic: { name: { startsWith: prefix } } } });
    await prisma.intelligenceTopic.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.intelligenceSource.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.$disconnect();
    if (app) await app.close();
  });

  it('supports paged topic CRUD, filters, null clearing, project links and soft archive', async () => {
    const created = (
      await request(app.getHttpServer())
        .post('/api/intelligence-topics')
        .send({
          name: `${prefix} AI policy`,
          description: 'Track policy',
          keywords: [' AI ', 'policy', 'AI'],
          projectIds: [projectId, projectId],
        })
        .expect(201)
    ).body.data;
    expect(created).toMatchObject({
      name: `${prefix} AI policy`,
      description: 'Track policy',
      keywords: ['AI', 'policy'],
    });
    expect(created.projects).toEqual([expect.objectContaining({ projectId })]);

    const listed = await request(app.getHttpServer())
      .get('/api/intelligence-topics')
      .query({ q: 'ai policy', projectId, page: 1, pageSize: 10 })
      .expect(200);
    expect(listed.body.data).toMatchObject({
      data: [expect.objectContaining({ id: created.id })],
      meta: { page: 1, pageSize: 10, total: 1 },
    });

    await request(app.getHttpServer())
      .patch(`/api/intelligence-topics/${created.id}`)
      .send({ description: null, keywords: [] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: created.id, description: null, keywords: [] });
      });
    await request(app.getHttpServer()).delete(`/api/intelligence-topics/${created.id}`).expect(204);
    await request(app.getHttpServer()).get(`/api/intelligence-topics/${created.id}`).expect(404);
    await request(app.getHttpServer())
      .get('/api/intelligence-topics')
      .query({ q: prefix })
      .expect(200)
      .expect(({ body }) => expect(body.data.meta.total).toBe(0));
  });

  it('validates source plans and records successful and failed manual runs without network work', async () => {
    const source = (
      await request(app.getHttpServer())
        .post('/api/intelligence-sources')
        .send({
          name: `${prefix} Manual source`,
          kind: 'MANUAL',
          url: 'https://example.com/source',
          credibility: 4,
          notes: 'Paste only',
        })
        .expect(201)
    ).body.data;

    await request(app.getHttpServer())
      .post('/api/intelligence-plans')
      .send({ sourceId: source.id, name: `${prefix} bad daily`, frequency: 'DAILY' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/intelligence-plans')
      .send({
        sourceId: source.id,
        name: `${prefix} bad manual`,
        frequency: 'MANUAL',
        runAtLocalTime: '09:00',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/intelligence-plans')
      .send({
        sourceId: source.id,
        name: `${prefix} bad weekly`,
        frequency: 'WEEKLY',
        runAtLocalTime: '09:00',
        weekday: 8,
      })
      .expect(400);

    const plan = (
      await request(app.getHttpServer())
        .post('/api/intelligence-plans')
        .send({
          sourceId: source.id,
          name: `${prefix} weekly paste`,
          frequency: 'WEEKLY',
          runAtLocalTime: '09:30',
          weekday: 1,
        })
        .expect(201)
    ).body.data;

    await request(app.getHttpServer())
      .patch(`/api/intelligence-plans/${plan.id}`)
      .send({ name: `${prefix} weekly paste revised` })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          frequency: 'WEEKLY',
          runAtLocalTime: '09:30',
          weekday: 1,
        });
      });

    await request(app.getHttpServer())
      .post(`/api/intelligence-plans/${plan.id}/runs`)
      .send({ status: 'FAILED', itemCount: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/intelligence-plans/${plan.id}/runs`)
      .send({ status: 'SUCCEEDED', errorMessage: 'not allowed' })
      .expect(400);

    const failed = (
      await request(app.getHttpServer())
        .post(`/api/intelligence-plans/${plan.id}/runs`)
        .send({
          status: 'FAILED',
          itemCount: 0,
          inputSummary: 'Two pasted rows failed validation',
          errorCode: 'PASTE_INVALID',
          errorMessage: 'Invalid pasted row',
          startedAt: '2026-07-20T01:00:00.000Z',
          finishedAt: '2026-07-20T01:01:00.000Z',
        })
        .expect(201)
    ).body.data;
    expect(failed).toMatchObject({
      planId: plan.id,
      trigger: 'MANUAL',
      status: 'FAILED',
      errorCode: 'PASTE_INVALID',
      errorMessage: 'Invalid pasted row',
    });

    const succeeded = (
      await request(app.getHttpServer())
        .post(`/api/intelligence-plans/${plan.id}/runs`)
        .send({
          status: 'SUCCEEDED',
          itemCount: 99,
          inputSummary: 'Two pasted rows',
          items: [
            { title: `${prefix} collected A`, canonicalUrl: `https://example.com/${prefix}/a` },
            { title: `${prefix} collected B`, summary: 'Structured paste' },
          ],
        })
        .expect(201)
    ).body.data;
    expect(succeeded).toMatchObject({ status: 'SUCCEEDED', itemCount: 2, errorMessage: null });
    await request(app.getHttpServer())
      .get('/api/intelligence-items')
      .query({ q: `${prefix} collected`, pageSize: 10 })
      .expect(200)
      .expect(({ body }) => expect(body.data.meta.total).toBe(2));

    const runs = await request(app.getHttpServer())
      .get('/api/intelligence-runs')
      .query({ planId: plan.id, status: 'FAILED', page: 1, pageSize: 10 })
      .expect(200);
    expect(runs.body.data).toMatchObject({
      data: [expect.objectContaining({ id: failed.id })],
      meta: { page: 1, pageSize: 10, total: 1 },
    });

    await request(app.getHttpServer()).delete(`/api/intelligence-plans/${plan.id}`).expect(204);
    await request(app.getHttpServer())
      .post(`/api/intelligence-plans/${plan.id}/runs`)
      .send({ status: 'SUCCEEDED', itemCount: 0 })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('INTELLIGENCE_INVALID_PLAN'));

    await request(app.getHttpServer())
      .patch(`/api/intelligence-sources/${source.id}`)
      .send({ url: null, notes: null })
      .expect(200)
      .expect(({ body }) => expect(body.data).toMatchObject({ url: null, notes: null }));
    await request(app.getHttpServer()).get(`/api/intelligence-sources/${source.id}`).expect(200);
    await request(app.getHttpServer()).delete(`/api/intelligence-sources/${source.id}`).expect(204);
  });

  it('rejects duplicate active names and archived project references with stable errors', async () => {
    const topicName = `${prefix} duplicate`;
    const topic = await request(app.getHttpServer())
      .post('/api/intelligence-topics')
      .send({ name: topicName })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/intelligence-topics/${topic.body.data.id}`)
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/intelligence-topics/${topic.body.data.id}`)
      .send({ keywords: null })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/intelligence-topics')
      .send({ name: topicName.toUpperCase() })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('INTELLIGENCE_TOPIC_EXISTS'));

    const archivedProject = await prisma.project.create({
      data: {
        code: `${prefix}-ARCHIVED`,
        name: `${prefix} archived`,
        archivedAt: new Date(),
      },
    });
    await request(app.getHttpServer())
      .post('/api/intelligence-topics')
      .send({ name: `${prefix} invalid project`, projectIds: [archivedProject.id] })
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe('PROJECT_NOT_FOUND'));
  });

  it('deduplicates cards, keeps conversions idempotent and freezes brief snapshots', async () => {
    const source = (
      await request(app.getHttpServer())
        .post('/api/intelligence-sources')
        .send({ name: `${prefix} card source`, kind: 'WEBSITE' })
        .expect(201)
    ).body.data;
    const created = (
      await request(app.getHttpServer())
        .post('/api/intelligence-items')
        .send({
          title: `${prefix} policy`,
          summary: 'Original human summary',
          canonicalUrl: 'HTTPS://Example.com/policy?b=2&a=1#section',
          sourceId: source.id,
          sourceUrl: 'https://source.example/first',
          priority: 'HIGH',
        })
        .expect(201)
    ).body.data;
    expect(created.merged).toBe(false);

    const duplicate = (
      await request(app.getHttpServer())
        .post('/api/intelligence-items')
        .send({
          title: `${prefix} incoming duplicate`,
          summary: 'Must not overwrite',
          canonicalUrl: 'https://example.com/policy?a=1&b=2',
          sourceId: source.id,
          sourceUrl: 'https://source.example/second',
        })
        .expect(201)
    ).body.data;
    expect(duplicate).toMatchObject({ itemId: created.itemId, merged: true });
    expect(duplicate.item).toMatchObject({ title: `${prefix} policy`, summary: 'Original human summary' });
    expect(duplicate.item.occurrences).toHaveLength(2);

    await request(app.getHttpServer()).delete(`/api/intelligence-items/${created.itemId}`).expect(204);
    const revived = (
      await request(app.getHttpServer())
        .post('/api/intelligence-items')
        .send({
          title: `${prefix} revived duplicate`,
          canonicalUrl: 'https://example.com/policy?a=1&b=2',
          sourceId: source.id,
          sourceUrl: 'https://source.example/third',
        })
        .expect(201)
    ).body.data;
    expect(revived).toMatchObject({ itemId: created.itemId, merged: true });

    const task = (
      await request(app.getHttpServer())
        .post(`/api/intelligence-items/${created.itemId}/task`)
        .send({ title: `${prefix} review policy` })
        .expect(201)
    ).body.data;
    const taskAgain = (
      await request(app.getHttpServer())
        .post(`/api/intelligence-items/${created.itemId}/task`)
        .send({ title: `${prefix} another title` })
        .expect(201)
    ).body.data;
    expect(taskAgain).toMatchObject({ targetId: task.targetId, alreadyExists: true });

    const knowledge = (
      await request(app.getHttpServer())
        .post(`/api/intelligence-items/${created.itemId}/knowledge-page`)
        .send({ title: `${prefix} knowledge page` })
        .expect(201)
    ).body.data;
    expect(knowledge).toMatchObject({ kind: 'KNOWLEDGE', alreadyExists: false });

    const brief = (
      await request(app.getHttpServer())
        .post('/api/intelligence-briefs')
        .send({ kind: 'DAILY', briefDate: '2026-07-20', itemIds: [created.itemId] })
        .expect(201)
    ).body.data;
    expect(brief.items[0].snapshot).toMatchObject({ summary: 'Original human summary' });
    await request(app.getHttpServer())
      .patch(`/api/intelligence-items/${created.itemId}`)
      .send({ summary: 'Edited after snapshot' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/intelligence-briefs/${brief.id}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.items[0].snapshot).toMatchObject({ summary: 'Original human summary' }),
      );
    await request(app.getHttpServer())
      .patch(`/api/intelligence-briefs/${brief.id}`)
      .send({
        kind: 'WEEKLY',
        briefDate: '2026-07-20',
        title: `${prefix} revised weekly brief`,
        itemIds: [created.itemId],
      })
      .expect(200)
      .expect(({ body }) => expect(body.data).toMatchObject({
        id: brief.id,
        kind: 'WEEKLY',
        title: `${prefix} revised weekly brief`,
      }));
  });
});
