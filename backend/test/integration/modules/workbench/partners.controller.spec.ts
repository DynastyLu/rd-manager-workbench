import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, ProjectStatus } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Partners API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-PARTNER-${Date.now()}`;
  let app: INestApplication;
  let activeProjectId = '';
  let draftProjectId = '';

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
    activeProjectId = (
      await prisma.project.create({
        data: { code: `${prefix}-ACTIVE`, name: `${prefix} active`, status: ProjectStatus.ACTIVE },
      })
    ).id;
    draftProjectId = (
      await prisma.project.create({
        data: { code: `${prefix}-DRAFT`, name: `${prefix} draft` },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.communicationRecord.deleteMany({ where: { subject: { startsWith: prefix } } });
    await prisma.partnerAgreement.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.partnerContact.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.partnerProject.deleteMany({
      where: { project: { code: { startsWith: prefix } } },
    });
    await prisma.partner.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('completes the partner lifecycle and converts communication once under concurrency', async () => {
    const partner = (
      await request(app.getHttpServer())
        .post('/api/partners')
        .send({
          name: `${prefix} Acme`,
          shortName: 'Acme',
          category: '供应商',
          projectIds: [activeProjectId],
        })
        .expect(201)
    ).body.data;
    const otherPartner = (
      await request(app.getHttpServer())
        .post('/api/partners')
        .send({ name: `${prefix} Other` })
        .expect(201)
    ).body.data;
    const otherContact = (
      await request(app.getHttpServer())
        .post(`/api/partners/${otherPartner.id}/contacts`)
        .send({ name: `${prefix} Other Contact` })
        .expect(201)
    ).body.data;

    const contact = (
      await request(app.getHttpServer())
        .post(`/api/partners/${partner.id}/contacts`)
        .send({ name: `${prefix} Alice`, phone: '13000000000' })
        .expect(201)
    ).body.data;
    const agreement = (
      await request(app.getHttpServer())
        .post(`/api/partners/${partner.id}/agreements`)
        .send({ title: `${prefix} Agreement`, status: 'ACTIVE', endAt: '2026-12-31T00:00:00.000Z' })
        .expect(201)
    ).body.data;
    const communication = (
      await request(app.getHttpServer())
        .post(`/api/partners/${partner.id}/communications`)
        .send({
          type: 'MEETING',
          occurredAt: '2026-07-20T08:00:00.000Z',
          subject: `${prefix} Follow-up`,
          contactId: contact.id,
          projectId: activeProjectId,
          nextFollowUpAt: '2026-07-25T08:00:00.000Z',
        })
        .expect(201)
    ).body.data;

    const filtered = await request(app.getHttpServer())
      .get('/api/partners')
      .query({
        q: 'acme',
        projectId: activeProjectId,
        nextFollowUpBefore: '2026-07-31T23:59:59.999Z',
      })
      .expect(200);
    expect(filtered.body.data.data).toEqual([
      expect.objectContaining({
        id: partner.id,
        contactCount: 1,
        activeAgreementCount: 1,
        projectCount: 1,
        lastCommunicationAt: '2026-07-20T08:00:00.000Z',
        nextFollowUpAt: '2026-07-25T08:00:00.000Z',
      }),
    ]);

    await request(app.getHttpServer())
      .patch(`/api/partners/${partner.id}`)
      .send({ shortName: null })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: partner.id,
          name: `${prefix} Acme`,
          shortName: null,
        });
      });
    await request(app.getHttpServer())
      .patch(`/api/partners/${partner.id}/contacts/${contact.id}`)
      .send({ phone: null })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: contact.id, name: `${prefix} Alice`, phone: null });
      });
    await request(app.getHttpServer())
      .patch(`/api/partners/${partner.id}/agreements/${agreement.id}`)
      .send({ endAt: null })
      .expect(200)
      .expect(({ body }) => expect(body.data.endAt).toBeNull());

    await request(app.getHttpServer())
      .patch(`/api/partners/${partner.id}/communications/${communication.id}`)
      .send({ contactId: otherContact.id })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/partners/${partner.id}/projects/${draftProjectId}`)
      .send({ role: '试用' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/partners/${partner.id}/projects/${activeProjectId}`)
      .expect(409);

    const conversions = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/communications/${communication.id}/task`)
        .send({ title: `${prefix} Communication task` })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/communications/${communication.id}/task`)
        .send({ title: `${prefix} Duplicate task` })
        .expect(201),
    ]);
    const results = conversions.map(({ body }) => body.data);
    expect(results.map(({ alreadyExists }) => alreadyExists).sort()).toEqual([false, true]);
    expect(results[0].task.id).toBe(results[1].task.id);
    await expect(
      prisma.workTask.count({ where: { sourceType: 'COMMUNICATION', sourceId: communication.id } }),
    ).resolves.toBe(1);

    await request(app.getHttpServer()).delete(`/api/partners/${partner.id}`).expect(409);
    await request(app.getHttpServer())
      .delete(`/api/partners/${partner.id}/communications/${communication.id}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/partners/${partner.id}/agreements/${agreement.id}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/partners/${partner.id}/contacts/${contact.id}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/partners/${partner.id}/projects/${activeProjectId}`)
      .expect(204);
    await request(app.getHttpServer()).delete(`/api/partners/${partner.id}`).expect(204);
  });
});
