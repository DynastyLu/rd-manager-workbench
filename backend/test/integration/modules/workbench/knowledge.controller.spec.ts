import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { FilesService } from '../../../../src/modules/workbench/content/application/files.service';

jest.setTimeout(30_000);

describe('KnowledgeController (integration)', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-KNOWLEDGE-${Date.now()}`;
  let app: INestApplication;
  const uploadedAssetIds: string[] = [];
  const folderWatchIds: string[] = [];
  const folderDocumentIds: string[] = [];
  const folderSpaceIds: string[] = [];
  const temporaryFolders: string[] = [];

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
    const files = app?.get(FilesService);
    for (const assetId of uploadedAssetIds) {
      await files?.permanentDelete(assetId).catch(() => undefined);
    }
    await prisma.folderWatch.deleteMany({ where: { id: { in: folderWatchIds } } });
    await prisma.contentDocument.deleteMany({ where: { id: { in: folderDocumentIds } } });
    await prisma.knowledgeSpace.deleteMany({ where: { id: { in: folderSpaceIds } } });
    for (const folderPath of temporaryFolders) {
      await rm(folderPath, { recursive: true, force: true });
    }
    await prisma.contentDocument.deleteMany({
      where: { title: { startsWith: prefix } },
    });
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

  it('POST /api/knowledge/documents/upload - persists the original file without returning extracted text', async () => {
    const originalName = `${prefix}-上传原件.txt`;
    const originalBytes = Buffer.from('这是需要保留的原文件内容');
    const res = await request(app.getHttpServer())
      .post('/api/knowledge/documents/upload')
      .attach('file', originalBytes, {
        filename: originalName,
        contentType: 'text/plain',
      })
      .expect(201);

    expect(res.body.data).toMatchObject({
      documentId: expect.any(String),
      originalName,
      mimeType: 'text/plain',
      fileSize: originalBytes.length,
      sourceKind: 'UPLOAD',
      processing: {
        preview: 'PENDING',
        index: 'PENDING',
      },
    });
    expect(res.body.data).not.toHaveProperty('plainText');
    expect(res.body.data).not.toHaveProperty('plainTextPreview');

    const stored = await prisma.contentDocument.findUniqueOrThrow({
      where: { id: res.body.data.documentId },
      include: {
        fileAssets: {
          include: { versions: true },
        },
      },
    });
    expect(stored.sourceSha256).toHaveLength(64);
    expect(stored.fileAssets[0]?.versions[0]).toMatchObject({
      originalName,
      mimeType: 'text/plain',
      size: originalBytes.length,
    });
    uploadedAssetIds.push(stored.fileAssets[0].id);

    for (let attempt = 0; attempt < 20; attempt++) {
      const processing = await prisma.contentDocument.findUnique({
        where: { id: stored.id },
        select: { indexStatus: true },
      });
      if (processing?.indexStatus !== 'PENDING' && processing?.indexStatus !== 'PROCESSING') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const processed = await prisma.contentDocument.findUniqueOrThrow({
      where: { id: stored.id },
      select: { indexStatus: true, plainText: true },
    });
    expect(processed.indexStatus).toBe('PARTIAL');
    expect(processed.plainText).toContain('需要保留的原文件内容');

    const source = await request(app.getHttpServer())
      .get(`/api/knowledge/documents/${stored.id}/source`)
      .expect('Content-Type', /text\/plain/)
      .expect(200);
    expect(source.text).toBe(originalBytes.toString('utf8'));
    expect(source.headers['content-disposition']).toContain('inline');

    const preview = await request(app.getHttpServer())
      .get(`/api/knowledge/documents/${stored.id}/preview`)
      .expect('Content-Type', /text\/plain/)
      .expect(200);
    expect(preview.text).toBe(originalBytes.toString('utf8'));
    await expect(prisma.contentDocument.findUniqueOrThrow({
      where: { id: stored.id },
      select: { previewStatus: true },
    })).resolves.toMatchObject({ previewStatus: 'READY' });
  });

  it('POST /api/knowledge/folders - imports local files as readable knowledge sources', async () => {
    const folderPath = await mkdtemp(join(tmpdir(), 'rd-knowledge-watch-'));
    temporaryFolders.push(folderPath);
    const filePath = join(folderPath, '研发周报.md');
    await writeFile(filePath, '# 本周进展\n\n完成知识库原文件同步。', 'utf8');

    const created = await request(app.getHttpServer())
      .post('/api/knowledge/folders')
      .send({ folderPath, label: `${prefix}-本地目录`, recursive: true })
      .expect(201);
    folderWatchIds.push(created.body.data.watchId);
    folderSpaceIds.push(created.body.data.spaceId);

    let tracked: Awaited<ReturnType<typeof prisma.folderFile.findFirst>> = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      tracked = await prisma.folderFile.findFirst({
        where: { watchId: created.body.data.watchId, filePath, status: 'ACTIVE' },
      });
      if (tracked) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(tracked).not.toBeNull();
    folderDocumentIds.push(tracked!.documentId);

    const document = await prisma.contentDocument.findUniqueOrThrow({
      where: { id: tracked!.documentId },
    });
    expect(document).toMatchObject({
      sourceKind: 'LOCAL_FILE',
      originalName: '研发周报.md',
      mimeType: 'text/markdown',
      sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(['READY', 'PARTIAL']).toContain(document.indexStatus);

    const source = await request(app.getHttpServer())
      .get(`/api/knowledge/documents/${document.id}/source`)
      .expect('Content-Type', /text\/markdown/)
      .expect(200);
    expect(source.text).toContain('完成知识库原文件同步');

    const openPath = await request(app.getHttpServer())
      .get(`/api/knowledge/documents/${document.id}/local-open-path`)
      .expect(200);
    expect(openPath.body.data).toEqual({ filePath: await realpath(filePath) });

    await request(app.getHttpServer())
      .delete(`/api/knowledge/folders/${created.body.data.watchId}`)
      .expect(200);
  });
});
