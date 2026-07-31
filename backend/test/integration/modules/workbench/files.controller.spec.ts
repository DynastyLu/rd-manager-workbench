import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NonProjectRdKind, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { LocalStorageAdapter } from '../../../../src/infrastructure/storage/local-storage.adapter';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('File assets API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-FILE-${Date.now()}`;
  let app: INestApplication;
  let authenticated: Awaited<ReturnType<typeof authenticatedRequest>>;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'rd-workbench-files-'));
    const { AppModule } = await import('../../../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StoragePort)
      .useValue(new LocalStorageAdapter(storageRoot))
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
    authenticated = await authenticatedRequest(app, prisma, 'SUPER_ADMIN', []);
  });

  afterAll(async () => {
    await prisma.fileAsset.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.contentDocument.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.partner.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.nonProjectRdItem.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    if (authenticated) {
      await prisma.loginAudit.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.rolePermission.deleteMany({ where: { roleId: authenticated.role.id } });
      await prisma.user.delete({ where: { id: authenticated.user.id } });
      await prisma.role.delete({ where: { id: authenticated.role.id } });
      await prisma.resourceProfile.delete({ where: { id: authenticated.employee.id } });
    }
    await prisma.$disconnect();
    await app?.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('uploads, lists and downloads an exact first file version', async () => {
    const document = await prisma.contentDocument.create({
      data: { type: 'DOCUMENT', title: `${prefix} 附件文档` },
    });
    const content = Buffer.from('first local attachment version\n', 'utf8');
    const uploaded = await authenticated.agent
      .post('/api/files')
      .field('documentId', document.id)
      .field('name', `${prefix} 研究附件.bin`)
      .attach('file', content, {
        filename: '研究附件.bin',
        contentType: 'application/octet-stream',
      })
      .expect(201);
    const asset = uploaded.body.data;
    const version = asset.versions[0];

    expect(asset).toMatchObject({
      name: `${prefix} 研究附件.bin`,
      documentId: document.id,
      status: 'ACTIVE',
    });
    expect(version).toMatchObject({
      versionNumber: 1,
      mimeType: 'application/octet-stream',
      size: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    });

    await authenticated.agent
      .get('/api/files')
      .query({ documentId: document.id, status: 'ACTIVE' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          data: [expect.objectContaining({ id: asset.id })],
          meta: { page: 1, pageSize: 20, total: 1 },
        });
      });

    const downloaded = await authenticated.agent
      .get(`/api/files/${asset.id}/download`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.headers['content-type']).toContain('application/octet-stream');
    expect(downloaded.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(
      createHash('sha256')
        .update(downloaded.body as Buffer)
        .digest('hex'),
    ).toBe(version.sha256);
  });

  it('uploads a new physical version and can download either version', async () => {
    const document = await prisma.contentDocument.create({
      data: { type: 'DOCUMENT', title: `${prefix} 版本附件文档` },
    });
    const first = Buffer.from('file-version-one');
    const second = Buffer.from('file-version-two-with-change');
    const created = await authenticated.agent
      .post('/api/files')
      .field('documentId', document.id)
      .field('name', `${prefix} 版本附件.bin`)
      .attach('file', first, 'version.bin')
      .expect(201);
    const assetId = created.body.data.id as string;
    const firstVersion = created.body.data.versions[0];
    const next = await authenticated.agent
      .post(`/api/files/${assetId}/versions`)
      .attach('file', second, 'version.bin')
      .expect(201);

    expect(next.body.data).toMatchObject({
      versionNumber: 2,
      sha256: createHash('sha256').update(second).digest('hex'),
    });
    const downloadHash = async (versionId?: string) => {
      const response = await authenticated.agent
        .get(`/api/files/${assetId}/download`)
        .query(versionId ? { versionId } : {})
        .buffer(true)
        .parse((stream, callback) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      return createHash('sha256')
        .update(response.body as Buffer)
        .digest('hex');
    };
    await expect(downloadHash(firstVersion.id)).resolves.toBe(firstVersion.sha256);
    await expect(downloadHash()).resolves.toBe(next.body.data.sha256);
    await expect(prisma.fileVersion.count({ where: { fileAssetId: assetId } })).resolves.toBe(2);
  });

  it('renames, re-associates, trashes and restores a file asset', async () => {
    const [document, project] = await Promise.all([
      prisma.contentDocument.create({ data: { type: 'DOCUMENT', title: `${prefix} 关联文档` } }),
      prisma.project.create({ data: { code: `${prefix}-OWNER`, name: `${prefix} 关联项目` } }),
    ]);
    const created = await authenticated.agent
      .post('/api/files')
      .field('documentId', document.id)
      .field('name', `${prefix} 待调整.bin`)
      .attach('file', Buffer.from('owner-change'), 'owner.bin')
      .expect(201);
    const assetId = created.body.data.id as string;

    await authenticated.agent
      .patch(`/api/files/${assetId}`)
      .send({ name: `${prefix} 已调整.bin`, documentId: null, projectId: project.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: assetId,
          name: `${prefix} 已调整.bin`,
          documentId: null,
          projectId: project.id,
        });
      });

    await authenticated.agent.delete(`/api/files/${assetId}`).expect(204);
    await authenticated.agent
      .get('/api/files')
      .query({ projectId: project.id, status: 'TRASHED' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.data).toEqual([
          expect.objectContaining({ id: assetId, status: 'TRASHED' }),
        ]);
      });
    await authenticated.agent
      .post(`/api/files/${assetId}/restore`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id: assetId, status: 'ACTIVE', trashedAt: null });
      });
  });

  it('rejects uploads without a file or an owning object', async () => {
    await authenticated.agent
      .post('/api/files')
      .field('name', `${prefix} 无文件.bin`)
      .expect(422);
    await authenticated.agent
      .post('/api/files')
      .field('name', `${prefix} 无关联.bin`)
      .attach('file', Buffer.from('orphan'), 'orphan.bin')
      .expect(422);
  });

  it('uploads and filters attachments by a real partner association', async () => {
    const partner = await prisma.partner.create({ data: { name: `${prefix} 资料合作方` } });
    const uploaded = await authenticated.agent
      .post('/api/files')
      .field('partnerId', partner.id)
      .field('name', `${prefix} 合作协议.pdf`)
      .attach('file', Buffer.from('partner-file'), 'agreement.pdf')
      .expect(201);

    expect(uploaded.body.data).toMatchObject({ partnerId: partner.id });
    await authenticated.agent
      .get('/api/files')
      .query({ partnerId: partner.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.data).toEqual([
          expect.objectContaining({ id: uploaded.body.data.id, partnerId: partner.id }),
        ]);
      });
    await authenticated.agent.delete(`/api/partners/${partner.id}`).expect(409);
    await authenticated.agent.delete(`/api/files/${uploaded.body.data.id}`).expect(204);
    await authenticated.agent.delete(`/api/partners/${partner.id}`).expect(204);
  });

  it('rejects an attachment that is assigned to more than one owning object', async () => {
    const [document, partner] = await Promise.all([
      prisma.contentDocument.create({ data: { type: 'DOCUMENT', title: `${prefix} 单一归属文档` } }),
      prisma.partner.create({ data: { name: `${prefix} 单一归属合作方` } }),
    ]);

    await authenticated.agent
      .post('/api/files')
      .field('documentId', document.id)
      .field('partnerId', partner.id)
      .field('name', `${prefix} 多重归属.bin`)
      .attach('file', Buffer.from('ambiguous-owner'), 'ambiguous.bin')
      .expect(422);
  });

  it('uploads and filters materials owned by a non-project R&D item', async () => {
    const item = await prisma.nonProjectRdItem.create({
      data: {
        code: `${prefix}-RD`,
        title: `${prefix} 技术预研`,
        kind: NonProjectRdKind.TECH_EXPLORATION,
      },
    });
    const uploaded = await authenticated.agent
      .post('/api/files')
      .field('nonProjectRdItemId', item.id)
      .field('name', `${prefix} 预研资料.md`)
      .attach('file', Buffer.from('# evidence'), 'evidence.md')
      .expect(201);

    expect(uploaded.body.data).toMatchObject({ nonProjectRdItemId: item.id });
    await authenticated.agent
      .get('/api/files')
      .query({ nonProjectRdItemId: item.id })
      .expect(200)
      .expect(({ body }) => expect(body.data.data).toEqual([
        expect.objectContaining({ id: uploaded.body.data.id, nonProjectRdItemId: item.id }),
      ]));
  });
});
