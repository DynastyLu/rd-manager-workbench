import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Knowledge and NOVA authorization (cross-user isolation)', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-AUTH-KNOWLEDGE-${Date.now()}`;
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
      ]),
      authenticatedRequest(app, prisma, 'EMPLOYEE-B', [
        { code: 'document.read', dataScope: 'INVOLVED' },
        { code: 'document.create', dataScope: 'INVOLVED' },
      ]),
      authenticatedRequest(app, prisma, 'SUPER_ADMIN'),
    ]);
  }, 120_000);

  afterAll(async () => {
    const users = [employeeA, employeeB, admin];
    await prisma.knowledgeMessage.deleteMany({
      where: { session: { title: { startsWith: prefix } } },
    });
    await prisma.knowledgeSession.deleteMany({
      where: { title: { startsWith: prefix } },
    });
    await prisma.contentDocument.deleteMany({ where: { title: { startsWith: prefix } } });
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

  it('blocks employee B from downloading employee A uploaded knowledge source', async () => {
    const originalName = `${prefix}-A-secret.txt`;
    const originalBytes = Buffer.from('这是 A 的私有知识内容');
    const res = await employeeA.agent
      .post('/api/knowledge/documents/upload')
      .attach('file', originalBytes, { filename: originalName, contentType: 'text/plain' })
      .expect(201);
    const documentId = res.body.data.documentId as string;

    await employeeA.agent.get(`/api/knowledge/documents/${documentId}/source`).expect(200);
    await employeeB.agent.get(`/api/knowledge/documents/${documentId}/source`).expect(403);
    await admin.agent.get(`/api/knowledge/documents/${documentId}/source`).expect(200);
  });

  it('blocks employee B from previewing employee A uploaded knowledge source', async () => {
    const originalName = `${prefix}-A-preview-secret.txt`;
    const originalBytes = Buffer.from('预览私有知识内容');
    const res = await employeeA.agent
      .post('/api/knowledge/documents/upload')
      .attach('file', originalBytes, { filename: originalName, contentType: 'text/plain' })
      .expect(201);
    const documentId = res.body.data.documentId as string;

    await employeeA.agent.get(`/api/knowledge/documents/${documentId}/preview`).expect(200);
    await employeeB.agent.get(`/api/knowledge/documents/${documentId}/preview`).expect(403);
  });

  it('blocks employee B from reading employee A private knowledge in NOVA chat citations', async () => {
    const originalName = `${prefix}-A-nova-secret.txt`;
    const originalBytes = Buffer.from(`NOVA 检索私有知识 ${prefix} 唯一标识符`);
    const res = await employeeA.agent
      .post('/api/knowledge/documents/upload')
      .attach('file', originalBytes, { filename: originalName, contentType: 'text/plain' })
      .expect(201);
    const documentId = res.body.data.documentId as string;

    for (let attempt = 0; attempt < 80; attempt++) {
      const doc = await prisma.contentDocument.findUnique({
        where: { id: documentId },
        select: { indexStatus: true },
      });
      if (doc?.indexStatus === 'READY' || doc?.indexStatus === 'PARTIAL') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const parseCitationDocumentIds = (streamText: string) => {
      const ids: string[] = [];
      const lines = streamText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === 'event: citation' && lines[i + 1]?.startsWith('data:')) {
          try {
            const payload = JSON.parse(lines[i + 1].slice('data:'.length).trim());
            if (payload.documentId) ids.push(payload.documentId);
          } catch {
            // ignore malformed event
          }
        }
      }
      return ids;
    };

    const novaA = await employeeA.agent
      .post('/api/knowledge/sessions')
      .send({ question: `${prefix} 唯一标识符` })
      .expect(201);
    const sessionA = novaA.body.data;

    const chatA = await employeeA.agent
      .post(`/api/knowledge/chat/${sessionA.id}/messages`)
      .send({ question: `${prefix} 唯一标识符` })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    const citationIdsA = parseCitationDocumentIds(chatA.text);
    expect(citationIdsA).toContain(documentId);

    const novaB = await employeeB.agent
      .post('/api/knowledge/sessions')
      .send({ question: `${prefix} 唯一标识符` })
      .expect(201);
    const sessionB = novaB.body.data;

    const chatB = await employeeB.agent
      .post(`/api/knowledge/chat/${sessionB.id}/messages`)
      .send({ question: `${prefix} 唯一标识符` })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    const citationIdsB = parseCitationDocumentIds(chatB.text);
    expect(citationIdsB).not.toContain(documentId);
  });

  it('allows shared users to read but not delete uploaded knowledge source', async () => {
    const originalName = `${prefix}-A-shared.txt`;
    const originalBytes = Buffer.from('共享知识内容');
    const res = await employeeA.agent
      .post('/api/knowledge/documents/upload')
      .attach('file', originalBytes, { filename: originalName, contentType: 'text/plain' })
      .expect(201);
    const documentId = res.body.data.documentId as string;

    await prisma.documentUserShare.create({
      data: { documentId, userId: employeeB.user.id },
    });

    await employeeB.agent.get(`/api/knowledge/documents/${documentId}/source`).expect(200);

    await prisma.documentUserShare.deleteMany({
      where: { documentId, userId: employeeB.user.id },
    });
  });

  it('restricts knowledge admin endpoints to super admin', async () => {
    await employeeA.agent.get('/api/knowledge/index-health').expect(403);
    await admin.agent.get('/api/knowledge/index-health').expect(200);
  });
});
