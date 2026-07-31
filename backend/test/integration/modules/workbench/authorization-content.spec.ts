import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Content authorization (cross-user isolation)', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-AUTH-CONTENT-${Date.now()}`;
  let app: INestApplication;
  let employeeA: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employeeB: Awaited<ReturnType<typeof authenticatedRequest>>;
  let admin: Awaited<ReturnType<typeof authenticatedRequest>>;

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

    [employeeA, employeeB, admin] = await Promise.all([
      authenticatedRequest(app, prisma, 'EMPLOYEE-A', [
        { code: 'document.read', dataScope: 'INVOLVED' },
        { code: 'document.create', dataScope: 'INVOLVED' },
        { code: 'document.update', dataScope: 'INVOLVED' },
        { code: 'document.delete', dataScope: 'INVOLVED' },
        { code: 'search.read', dataScope: 'INVOLVED' },
      ]),
      authenticatedRequest(app, prisma, 'EMPLOYEE-B', [
        { code: 'document.read', dataScope: 'INVOLVED' },
        { code: 'document.create', dataScope: 'INVOLVED' },
        { code: 'document.update', dataScope: 'INVOLVED' },
        { code: 'document.delete', dataScope: 'INVOLVED' },
        { code: 'search.read', dataScope: 'INVOLVED' },
      ]),
      authenticatedRequest(app, prisma, 'SUPER_ADMIN'),
    ]);
  }, 120_000);

  afterAll(async () => {
    const users = [employeeA, employeeB, admin];
    await prisma.contentDocument.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.knowledgeSpace.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.fileAsset.deleteMany({ where: { name: { startsWith: prefix } } });
    for (const user of users) {
      if (!user) continue;
      await prisma.loginAudit.deleteMany({ where: { userId: user.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: user.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.user.id } });
      await prisma.user.delete({ where: { id: user.user.id } });
      await prisma.role.delete({ where: { id: user.role.id } });
      await prisma.resourceProfile.delete({ where: { id: user.employee.id } });
    }
    await prisma.$disconnect();
    await app?.close();
  });

  it('rejects anonymous document requests', async () => {
    await request(app.getHttpServer())
      .get('/api/documents')
      .expect(401)
      .expect(({ body }) => {
        expect(body).toMatchObject({ success: false, error: { code: 'AUTH_REQUIRED' } });
      });
  });

  it('allows employee A to create and read a private document, and blocks employee B', async () => {
    const created = await employeeA.agent
      .post('/api/documents')
      .send({
        type: 'DOCUMENT',
        title: `${prefix} A-private`,
        content: { type: 'doc', content: [] },
        plainText: 'secret content',
      })
      .expect(201);
    const documentId = created.body.data.id as string;

    await employeeA.agent.get(`/api/documents/${documentId}`).expect(200);

    await employeeB.agent.get(`/api/documents/${documentId}`).expect(403);

    const listA = await employeeA.agent.get('/api/documents').query({ query: prefix }).expect(200);
    expect(listA.body.data.data.some((doc: { id: string }) => doc.id === documentId)).toBe(true);

    const listB = await employeeB.agent.get('/api/documents').query({ query: prefix }).expect(200);
    expect(listB.body.data.data.some((doc: { id: string }) => doc.id === documentId)).toBe(false);

    await admin.agent.get(`/api/documents/${documentId}`).expect(200);
  });

  it('blocks employee B from updating or trashing employee A document', async () => {
    const created = await employeeA.agent
      .post('/api/documents')
      .send({
        type: 'DOCUMENT',
        title: `${prefix} A-private-update`,
        content: { type: 'doc', content: [] },
        plainText: 'secret content',
      })
      .expect(201);
    const documentId = created.body.data.id as string;

    await employeeB.agent
      .patch(`/api/documents/${documentId}`)
      .send({ title: `${prefix} hacked` })
      .expect(403);
    await employeeB.agent.delete(`/api/documents/${documentId}`).expect(403);
  });

  it('allows explicitly shared users to read but not edit a private document', async () => {
    const created = await employeeA.agent
      .post('/api/documents')
      .send({
        type: 'DOCUMENT',
        title: `${prefix} A-shared`,
        content: { type: 'doc', content: [] },
        plainText: 'shared content',
      })
      .expect(201);
    const documentId = created.body.data.id as string;

    await prisma.documentUserShare.create({
      data: { documentId, userId: employeeB.user.id },
    });

    await employeeB.agent.get(`/api/documents/${documentId}`).expect(200);
    await employeeB.agent
      .patch(`/api/documents/${documentId}`)
      .send({ title: `${prefix} hacked` })
      .expect(403);

    await prisma.documentUserShare.deleteMany({
      where: { documentId, userId: employeeB.user.id },
    });
  });

  it('allows shared role members to read but not edit a private document', async () => {
    const created = await employeeA.agent
      .post('/api/documents')
      .send({
        type: 'DOCUMENT',
        title: `${prefix} A-role-shared`,
        content: { type: 'doc', content: [] },
        plainText: 'role shared content',
      })
      .expect(201);
    const documentId = created.body.data.id as string;

    await prisma.documentRoleShare.create({
      data: { documentId, roleId: employeeB.role.id },
    });

    await employeeB.agent.get(`/api/documents/${documentId}`).expect(200);
    await employeeB.agent
      .patch(`/api/documents/${documentId}`)
      .send({ title: `${prefix} hacked` })
      .expect(403);

    await prisma.documentRoleShare.deleteMany({
      where: { documentId, roleId: employeeB.role.id },
    });
  });

  it('blocks employee B from receiving private documents in global search', async () => {
    const created = await employeeA.agent
      .post('/api/documents')
      .send({
        type: 'DOCUMENT',
        title: `${prefix} A-search-secret`,
        content: { type: 'doc', content: [] },
        plainText: 'search secret',
      })
      .expect(201);
    const documentId = created.body.data.id as string;

    const searchA = await employeeA.agent
      .get('/api/search')
      .query({ q: `${prefix} A-search-secret`, types: 'DOCUMENT' })
      .expect(200);
    expect(searchA.body.data.data.some((hit: { id: string }) => hit.id === documentId)).toBe(true);

    const searchB = await employeeB.agent
      .get('/api/search')
      .query({ q: `${prefix} A-search-secret`, types: 'DOCUMENT' })
      .expect(200);
    expect(searchB.body.data.data.some((hit: { id: string }) => hit.id === documentId)).toBe(false);
  });

  it('blocks employee B from listing or opening employee A private knowledge space', async () => {
    const created = await employeeA.agent
      .post('/api/knowledge-spaces')
      .send({ name: `${prefix} A-space` })
      .expect(201);
    const spaceId = created.body.data.id as string;

    await employeeA.agent.get('/api/knowledge-spaces').expect(200);
    const listB = await employeeB.agent.get('/api/knowledge-spaces').expect(200);
    expect(listB.body.data.some((space: { id: string }) => space.id === spaceId)).toBe(false);

    await employeeB.agent.patch(`/api/knowledge-spaces/${spaceId}`).send({ name: 'hacked' }).expect(403);
  });
});
