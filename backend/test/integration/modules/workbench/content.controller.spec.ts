import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Content and knowledge API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-CONTENT-${Date.now()}`;
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
    authenticated = await authenticatedRequest(app, prisma, 'EMPLOYEE', [
      { code: 'document.read', dataScope: 'INVOLVED' },
      { code: 'document.create', dataScope: 'INVOLVED' },
      { code: 'document.update', dataScope: 'INVOLVED' },
      { code: 'document.delete', dataScope: 'INVOLVED' },
    ]);
  }, 120_000);

  afterAll(async () => {
    await prisma.contentDocument.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.knowledgeSpace.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
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

  it('creates and updates knowledge spaces', async () => {
    const created = await authenticated.agent
      .post('/api/knowledge-spaces')
      .send({ name: `${prefix} 研发知识`, description: '团队方法与记录', sequence: 2 })
      .expect(201);

    await authenticated.agent
      .patch(`/api/knowledge-spaces/${created.body.data.id}`)
      .send({ name: `${prefix} 研发知识库`, sequence: 1 })
      .expect(200);

    await authenticated.agent
      .get('/api/knowledge-spaces')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: created.body.data.id,
              name: `${prefix} 研发知识库`,
              sequence: 1,
            }),
          ]),
        );
      });
  });

  it('auto-saves, filters, trashes and restores a knowledge page', async () => {
    const [space, project] = await Promise.all([
      prisma.knowledgeSpace.create({ data: { name: `${prefix} 文档空间` } }),
      prisma.project.create({ data: { code: `${prefix}-PROJECT`, name: `${prefix} 项目` } }),
    ]);
    const created = await authenticated.agent
      .post('/api/documents')
      .send({
        type: 'KNOWLEDGE_PAGE',
        title: `${prefix} 部署手册`,
        content: { type: 'doc', content: [] },
        plainText: '初始部署内容',
        tags: ['部署', '研发'],
        isFavorite: true,
        spaceId: space.id,
        projectId: project.id,
      })
      .expect(201);
    const documentId = created.body.data.id as string;

    await authenticated.agent
      .patch(`/api/documents/${documentId}`)
      .send({
        title: `${prefix} 本地部署手册`,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        plainText: 'PostgreSQL 本地部署与备份',
        tags: ['PostgreSQL', '部署'],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: documentId,
          plainText: 'PostgreSQL 本地部署与备份',
          tags: ['PostgreSQL', '部署'],
          isFavorite: true,
          status: 'ACTIVE',
        });
      });

    await authenticated.agent
      .get('/api/documents')
      .query({
        type: 'KNOWLEDGE_PAGE',
        spaceId: space.id,
        projectId: project.id,
        status: 'ACTIVE',
        query: 'PostgreSQL',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          data: [expect.objectContaining({ id: documentId })],
          meta: { page: 1, pageSize: 20, total: 1 },
        });
      });

    await authenticated.agent.delete(`/api/documents/${documentId}`).expect(204);
    await authenticated.agent
      .get('/api/documents')
      .query({ status: 'TRASHED', query: prefix })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.data).toEqual([
          expect.objectContaining({ id: documentId, status: 'TRASHED' }),
        ]);
      });
    await authenticated.agent
      .post(`/api/documents/${documentId}/restore`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: documentId, status: 'ACTIVE', trashedAt: null });
      });
  });

  it('saves immutable versions and restores content plus associations as a new version', async () => {
    const [firstSpace, secondSpace, firstProject, secondProject] = await Promise.all([
      prisma.knowledgeSpace.create({ data: { name: `${prefix} 版本空间 A` } }),
      prisma.knowledgeSpace.create({ data: { name: `${prefix} 版本空间 B` } }),
      prisma.project.create({ data: { code: `${prefix}-VERSION-A`, name: `${prefix} 项目 A` } }),
      prisma.project.create({ data: { code: `${prefix}-VERSION-B`, name: `${prefix} 项目 B` } }),
    ]);
    const created = await authenticated.agent
      .post('/api/documents')
      .send({
        type: 'DOCUMENT',
        title: `${prefix} 设计记录`,
        content: { type: 'doc', content: [{ text: '版本一' }] },
        plainText: '版本一',
        tags: ['v1'],
        spaceId: firstSpace.id,
        projectId: firstProject.id,
      })
      .expect(201);
    const documentId = created.body.data.id as string;
    const saved = await authenticated.agent
      .post(`/api/documents/${documentId}/versions`)
      .expect(201);

    await authenticated.agent
      .patch(`/api/documents/${documentId}`)
      .send({
        title: `${prefix} 设计记录（修改）`,
        content: { type: 'doc', content: [{ text: '版本二' }] },
        plainText: '版本二',
        tags: ['v2'],
        spaceId: secondSpace.id,
        projectId: secondProject.id,
      })
      .expect(200);

    await authenticated.agent
      .post(`/api/documents/${documentId}/versions/${saved.body.data.id}/restore`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: documentId,
          title: `${prefix} 设计记录`,
          plainText: '版本一',
          tags: ['v1'],
          spaceId: firstSpace.id,
          projectId: firstProject.id,
        });
      });

    await authenticated.agent
      .get(`/api/documents/${documentId}/versions`)
      .expect(200)
      .expect(({ body }) => {
        expect(
          body.data.map((version: { versionNumber: number }) => version.versionNumber),
        ).toEqual([2, 1]);
        expect(body.data[0]).toMatchObject({ restoredFromVersionId: saved.body.data.id });
      });
  });

  it('rejects a document as its own parent', async () => {
    const created = await authenticated.agent
      .post('/api/documents')
      .send({ type: 'DOCUMENT', title: `${prefix} 目录节点` })
      .expect(201);

    await authenticated.agent
      .patch(`/api/documents/${created.body.data.id}`)
      .send({ parentId: created.body.data.id })
      .expect(422);
  });

  it('rejects restoring a saved parent when it would create a directory cycle', async () => {
    const space = await prisma.knowledgeSpace.create({
      data: { name: `${prefix} 循环目录空间` },
    });
    const parent = await authenticated.agent
      .post('/api/documents')
      .send({ type: 'DOCUMENT', title: `${prefix} 目录 A`, spaceId: space.id })
      .expect(201);
    const child = await authenticated.agent
      .post('/api/documents')
      .send({
        type: 'DOCUMENT',
        title: `${prefix} 目录 B`,
        spaceId: space.id,
        parentId: parent.body.data.id,
      })
      .expect(201);
    const saved = await authenticated.agent
      .post(`/api/documents/${child.body.data.id}/versions`)
      .expect(201);

    await authenticated.agent
      .patch(`/api/documents/${child.body.data.id}`)
      .send({ parentId: null })
      .expect(200);
    await authenticated.agent
      .patch(`/api/documents/${parent.body.data.id}`)
      .send({ parentId: child.body.data.id })
      .expect(200);

    await authenticated.agent
      .post(`/api/documents/${child.body.data.id}/versions/${saved.body.data.id}/restore`)
      .expect(422);
  });

  it('rejects permanent deletion of an active document and deletes it after trashing', async () => {
    const document = await prisma.contentDocument.create({
      data: {
        type: 'DOCUMENT',
        title: `${prefix} 永久删除契约`,
        ownerUserId: authenticated.user.id,
        createdByUserId: authenticated.user.id,
        updatedByUserId: authenticated.user.id,
      },
    });

    await authenticated.agent
      .delete(`/api/documents/${document.id}/permanent`)
      .expect(409);
    await expect(
      prisma.contentDocument.findUnique({ where: { id: document.id } }),
    ).resolves.not.toBeNull();

    await authenticated.agent.delete(`/api/documents/${document.id}`).expect(204);
    await authenticated.agent
      .delete(`/api/documents/${document.id}/permanent`)
      .expect(204);
    await expect(
      prisma.contentDocument.findUnique({ where: { id: document.id } }),
    ).resolves.toBeNull();
  });

  it('clears the document trash and returns the number deleted', async () => {
    const documents = await Promise.all([
      prisma.contentDocument.create({
        data: {
          type: 'DOCUMENT',
          title: `${prefix} 清空回收站 A`,
          status: 'TRASHED',
          trashedAt: new Date(),
          ownerUserId: authenticated.user.id,
          createdByUserId: authenticated.user.id,
          updatedByUserId: authenticated.user.id,
        },
      }),
      prisma.contentDocument.create({
        data: {
          type: 'DOCUMENT',
          title: `${prefix} 清空回收站 B`,
          status: 'TRASHED',
          trashedAt: new Date(),
          ownerUserId: authenticated.user.id,
          createdByUserId: authenticated.user.id,
          updatedByUserId: authenticated.user.id,
        },
      }),
    ]);

    await authenticated.agent
      .delete('/api/documents/trash')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ deleted: 2 });
      });

    await expect(
      prisma.contentDocument.count({
        where: { id: { in: documents.map(({ id }) => id) } },
      }),
    ).resolves.toBe(0);
  });
});
