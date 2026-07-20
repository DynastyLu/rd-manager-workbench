import { INestApplication, ValidationPipe } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { ExtensionsGateway } from '../../../../src/modules/workbench/extensions/extensions.gateway';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { ExternalSyncCompletionService } from '../../../../src/modules/workbench/extensions/application/external-sync-completion.service';

jest.setTimeout(30_000);

describe('Authoritative external sync workflow', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-SYNC-${Date.now()}`;
  let app: INestApplication;
  let gateway: ExtensionsGateway;
  let storage: StoragePort;
  let syncCompletion: ExternalSyncCompletionService;
  const storageKeys: string[] = [];

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
    gateway = app.get(ExtensionsGateway);
    storage = app.get(StoragePort);
    syncCompletion = app.get(ExternalSyncCompletionService);
  });

  afterAll(async () => {
    await prisma.externalObjectLink.deleteMany({ where: { profile: { name: { startsWith: prefix } } } });
    await prisma.externalSyncSession.deleteMany({ where: { profile: { name: { startsWith: prefix } } } });
    await prisma.extensionRun.deleteMany({ where: { profile: { name: { startsWith: prefix } } } });
    await prisma.extensionProfile.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.fileAsset.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: 'TSYNC' } } });
    await Promise.all(storageKeys.map((key) => storage.delete(key).catch(() => undefined)));
    await prisma.$disconnect();
    if (app) await app.close();
  });

  it('prepares a provider run from a server-owned calendar range instead of client hashes', async () => {
    const profile = await prisma.extensionProfile.create({
      data: {
        kind: 'CALENDAR', provider: 'CALDAV', name: `${prefix} calendar`, enabled: true,
        credentialRef: 'credential:test-sync-calendar',
        publicConfig: { baseUrl: 'https://dav.example.com', calendarPath: '/calendar/', syncDirection: 'PULL_ONLY' },
        permissions: ['CALENDAR_SYNC_PREFLIGHT'],
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/extensions/sync/prepare')
      .send({
        profileId: profile.id,
        target: { type: 'CALENDAR', startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-21T00:00:00.000Z' },
      })
      .expect(201);
    expect(response.body.data).toMatchObject({
      sessionId: expect.any(String), operation: 'CALENDAR_SYNC_PREFLIGHT',
      confirmationHash: expect.stringMatching(/^[0-9a-f]{64}$/), requiresConfirmation: true,
    });
    expect(JSON.stringify(response.body)).not.toContain('remoteHash');
  });

  it('accepts only provider-discovered CalDAV facts and commits KEEP_REMOTE into CalendarEvent and link atomically', async () => {
    const profile = await prisma.extensionProfile.create({
      data: {
        kind: 'CALENDAR', provider: 'CALDAV', name: `${prefix} calendar workflow`, enabled: true,
        credentialRef: 'credential:test-sync-calendar-workflow',
        publicConfig: { baseUrl: 'https://dav.example.com', calendarPath: '/calendar/', syncDirection: 'PULL_ONLY' },
        permissions: ['CALENDAR_SYNC_PREFLIGHT', 'CALENDAR_SYNC_COMMIT'],
      },
    });
    const prepared = (await request(app.getHttpServer()).post('/api/extensions/sync/prepare').send({
      profileId: profile.id,
      target: { type: 'CALENDAR', startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-22T00:00:00.000Z' },
    }).expect(201)).body.data;
    const publish = jest.spyOn(gateway, 'publishRunRequested');
    const started = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${prepared.sessionId}/start`)
      .send({ confirmationHash: prepared.confirmationHash }).expect(201)).body.data;
    const event = publish.mock.calls.at(-1)?.[0];
    expect(event).toMatchObject({ runId: started.runId, operation: 'CALENDAR_SYNC_PREFLIGHT' });
    const remoteTitle = `${prefix} Remote interview`;
    await request(app.getHttpServer()).post(`/api/extensions/runs/${started.runId}/complete`).send({
      completionToken: event!.completionToken,
      status: 'SUCCEEDED',
      output: {
        items: [{
          remoteId: '/calendar/interview.ics', remoteVersion: '"v1"',
          ical: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:interview\r\nDTSTART:20260721T020000Z\r\nDTEND:20260721T030000Z\r\nSUMMARY:${remoteTitle}\r\nLOCATION:Room A\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
        }],
      },
    }).expect(201);
    const ready = (await request(app.getHttpServer())
      .get(`/api/extensions/sync/preflights/${prepared.sessionId}`).expect(200)).body.data;
    expect(ready).toMatchObject({ status: 'READY', preflight: { preflightHash: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(ready.preflight.items[0]).toMatchObject({
      itemKey: '/calendar/interview.ics', action: 'ADD', allowedResolutions: ['KEEP_REMOTE'],
      remotePreview: { title: remoteTitle },
    });
    await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${prepared.sessionId}/commit`)
      .send({
        preflightHash: ready.preflight.preflightHash,
        resolutions: [{ itemKey: '/calendar/interview.ics', resolution: 'KEEP_REMOTE' }],
      })
      .expect(201)
      .expect(({ body }) => expect(body.data.status).toBe('COMMITTED'));
    const created = await prisma.calendarEvent.findFirstOrThrow({ where: { title: remoteTitle } });
    await expect(prisma.externalObjectLink.findUniqueOrThrow({
      where: { profileId_remoteId: { profileId: profile.id, remoteId: '/calendar/interview.ics' } },
    })).resolves.toMatchObject({ localType: 'CALENDAR_EVENT', localId: created.id, syncHash: expect.stringMatching(/^[0-9a-f]{64}$/) });

    await prisma.calendarEvent.update({ where: { id: created.id }, data: { title: `${remoteTitle} local edit` } });
    await prisma.extensionProfile.update({
      where: { id: profile.id },
      data: { publicConfig: { baseUrl: 'https://dav.example.com', calendarPath: '/calendar/', syncDirection: 'BIDIRECTIONAL' } },
    });
    const conflictPrepared = (await request(app.getHttpServer()).post('/api/extensions/sync/prepare').send({
      profileId: profile.id,
      target: { type: 'CALENDAR', startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-22T00:00:00.000Z' },
    }).expect(201)).body.data;
    const conflictStarted = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${conflictPrepared.sessionId}/start`)
      .send({ confirmationHash: conflictPrepared.confirmationHash }).expect(201)).body.data;
    const conflictEvent = publish.mock.calls.at(-1)![0];
    await request(app.getHttpServer()).post(`/api/extensions/runs/${conflictStarted.runId}/complete`).send({
      completionToken: conflictEvent.completionToken, status: 'SUCCEEDED',
      output: { items: [{
        remoteId: '/calendar/interview.ics', remoteVersion: '"v2"',
        ical: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:interview\r\nDTSTART:20260721T020000Z\r\nDTEND:20260721T040000Z\r\nSUMMARY:${remoteTitle} remote edit\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
      }] },
    }).expect(201);
    const conflict = (await request(app.getHttpServer()).get(`/api/extensions/sync/preflights/${conflictPrepared.sessionId}`).expect(200)).body.data;
    expect(conflict.preflight.items[0]).toMatchObject({
      action: 'CONFLICT', allowedResolutions: ['KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY'],
    });
    publish.mockRestore();
  });

  it('uploads an explicit FileAsset from verified storage and writes its link only after provider commit', async () => {
    const project = await prisma.project.create({
      data: { code: `TSYNC${Date.now()}`, name: `${prefix} project`, objective: 'sync test' },
    });
    const asset = await prisma.fileAsset.create({ data: { name: `${prefix} file.txt`, projectId: project.id } });
    const content = Buffer.from('authoritative local file');
    const sha256 = 'dbc05c27e0a19f6082e2fa70791af9107ac0238dd82c77f8aa1f547b6f77736e';
    const storageKey = `files/${asset.id}/sync-v1`;
    storageKeys.push(storageKey);
    await storage.write({ key: storageKey, content, mimeType: 'text/plain' });
    await prisma.fileVersion.create({
      data: { fileAssetId: asset.id, versionNumber: 1, storageKey, originalName: asset.name, mimeType: 'text/plain', size: content.length, sha256 },
    });
    const profile = await prisma.extensionProfile.create({
      data: {
        kind: 'CLOUD_DRIVE', provider: 'WEBDAV', name: `${prefix} webdav workflow`, enabled: true,
        credentialRef: 'credential:test-sync-webdav',
        publicConfig: { baseUrl: 'https://dav.example.com', remoteRoot: '/workbench/' },
        permissions: ['CLOUD_UPLOAD_PREFLIGHT', 'CLOUD_UPLOAD_COMMIT', 'CLOUD_DOWNLOAD_PREFLIGHT', 'CLOUD_DOWNLOAD_COMMIT'],
      },
    });
    const prepared = (await request(app.getHttpServer()).post('/api/extensions/sync/prepare').send({
      profileId: profile.id,
      target: { type: 'FILE', fileAssetId: asset.id, remotePath: 'docs/file.txt', mode: 'UPLOAD' },
    }).expect(201)).body.data;
    const publish = jest.spyOn(gateway, 'publishRunRequested');
    const started = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${prepared.sessionId}/start`)
      .send({ confirmationHash: prepared.confirmationHash }).expect(201)).body.data;
    const preflightEvent = publish.mock.calls.at(-1)![0];
    expect(preflightEvent.payload).toMatchObject({ localId: asset.id, localHash: sha256, remotePath: 'docs/file.txt' });
    await request(app.getHttpServer()).post(`/api/extensions/runs/${started.runId}/complete`).send({
      completionToken: preflightEvent.completionToken, status: 'SUCCEEDED',
      output: { action: 'ADD', remotePath: 'docs/file.txt' },
    }).expect(201);
    const ready = (await request(app.getHttpServer()).get(`/api/extensions/sync/preflights/${prepared.sessionId}`).expect(200)).body.data;
    const committing = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${prepared.sessionId}/commit`)
      .send({ preflightHash: ready.preflight.preflightHash, resolutions: [{ itemKey: asset.id, resolution: 'KEEP_LOCAL' }] })
      .expect(201)).body.data;
    expect(committing.status).toBe('COMMIT_RUNNING');
    expect(await prisma.externalObjectLink.findFirst({ where: { profileId: profile.id } })).toBeNull();
    const commitEvent = publish.mock.calls.at(-1)![0];
    expect(commitEvent).toMatchObject({ operation: 'CLOUD_UPLOAD_COMMIT', payload: { contentBase64: content.toString('base64'), sha256 } });
    const originalPrepare = syncCompletion.prepare.bind(syncCompletion);
    let externalApplyCount = 0;
    const completionSpy = jest.spyOn(syncCompletion, 'prepare').mockImplementation(async (...args) => {
      const preparedCompletion = await originalPrepare(...args);
      if (!preparedCompletion) return preparedCompletion;
      return {
        ...preparedCompletion,
        apply: async (tx) => {
          externalApplyCount += 1;
          await preparedCompletion.apply(tx);
        },
      };
    });
    const completionBody = {
      completionToken: commitEvent.completionToken, status: 'SUCCEEDED',
      output: { remotePath: 'docs/file.txt', remoteVersion: '"remote-v1"', sha256 },
    };
    const duplicate = await Promise.all([
      request(app.getHttpServer()).post(`/api/extensions/runs/${committing.runId}/complete`).send(completionBody),
      request(app.getHttpServer()).post(`/api/extensions/runs/${committing.runId}/complete`).send(completionBody),
    ]);
    expect(duplicate.map((response) => response.status)).toEqual([201, 201]);
    expect(externalApplyCount).toBe(1);
    completionSpy.mockRestore();
    await expect(prisma.externalObjectLink.findUniqueOrThrow({
      where: { profileId_remoteId: { profileId: profile.id, remoteId: 'docs/file.txt' } },
    })).resolves.toMatchObject({ localId: asset.id, remoteVersion: '"remote-v1"', syncHash: sha256 });

    const failedPrepared = (await request(app.getHttpServer()).post('/api/extensions/sync/prepare').send({
      profileId: profile.id,
      target: { type: 'FILE', fileAssetId: asset.id, remotePath: 'docs/failed.txt', mode: 'DOWNLOAD' },
    }).expect(201)).body.data;
    const failedStarted = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${failedPrepared.sessionId}/start`)
      .send({ confirmationHash: failedPrepared.confirmationHash }).expect(201)).body.data;
    const failedPreflightEvent = publish.mock.calls.at(-1)![0];
    await request(app.getHttpServer()).post(`/api/extensions/runs/${failedStarted.runId}/complete`).send({
      completionToken: failedPreflightEvent.completionToken, status: 'SUCCEEDED',
      output: { action: 'UPDATE', remotePath: 'docs/failed.txt', remoteVersion: '"failed-v1"', remoteHash: sha256 },
    }).expect(201);
    const failedReady = (await request(app.getHttpServer()).get(`/api/extensions/sync/preflights/${failedPrepared.sessionId}`).expect(200)).body.data;
    const failedCommit = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${failedPrepared.sessionId}/commit`)
      .send({ preflightHash: failedReady.preflight.preflightHash, resolutions: [{ itemKey: asset.id, resolution: 'KEEP_REMOTE' }] })
      .expect(201)).body.data;
    const failedCommitEvent = publish.mock.calls.at(-1)![0];
    await request(app.getHttpServer()).post(`/api/extensions/runs/${failedCommit.runId}/complete`).send({
      completionToken: failedCommitEvent.completionToken, status: 'FAILED', errorCode: 'HTTP_500', metadata: { retryable: false },
    }).expect(201);
    await request(app.getHttpServer()).get(`/api/extensions/sync/preflights/${failedPrepared.sessionId}`).expect(200)
      .expect(({ body }) => expect(body.data).toMatchObject({ status: 'FAILED', errorCode: 'HTTP_500' }));
    expect(await prisma.fileVersion.count({ where: { fileAssetId: asset.id } })).toBe(1);
    expect(await prisma.externalObjectLink.findUnique({
      where: { profileId_remoteId: { profileId: profile.id, remoteId: 'docs/failed.txt' } },
    })).toBeNull();
    publish.mockRestore();
  });

  it('downloads verified WebDAV bytes into a CREATE_COPY FileAsset and preserves all source associations', async () => {
    const project = await prisma.project.create({
      data: { code: `TSYNC${Date.now()}D`, name: `${prefix} download project`, objective: 'download sync test' },
    });
    const source = await prisma.fileAsset.create({ data: { name: `${prefix} source.pdf`, projectId: project.id } });
    const local = Buffer.from('old local body');
    const localHash = createHash('sha256').update(local).digest('hex');
    const sourceStorageKey = `files/${source.id}/download-source-v1`;
    storageKeys.push(sourceStorageKey);
    await storage.write({ key: sourceStorageKey, content: local, mimeType: 'application/pdf' });
    await prisma.fileVersion.create({
      data: { fileAssetId: source.id, versionNumber: 1, storageKey: sourceStorageKey, originalName: source.name, mimeType: 'application/pdf', size: local.length, sha256: localHash },
    });
    const profile = await prisma.extensionProfile.create({
      data: {
        kind: 'CLOUD_DRIVE', provider: 'WEBDAV', name: `${prefix} webdav download`, enabled: true,
        credentialRef: 'credential:test-sync-webdav-download',
        publicConfig: { baseUrl: 'https://dav.example.com', remoteRoot: '/workbench/' },
        permissions: ['CLOUD_DOWNLOAD_PREFLIGHT', 'CLOUD_DOWNLOAD_COMMIT'],
      },
    });
    const remote = Buffer.from('verified remote body');
    const remoteHash = createHash('sha256').update(remote).digest('hex');
    const prepared = (await request(app.getHttpServer()).post('/api/extensions/sync/prepare').send({
      profileId: profile.id,
      target: { type: 'FILE', fileAssetId: source.id, remotePath: 'docs/source.pdf', mode: 'DOWNLOAD' },
    }).expect(201)).body.data;
    const publish = jest.spyOn(gateway, 'publishRunRequested');
    const started = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${prepared.sessionId}/start`)
      .send({ confirmationHash: prepared.confirmationHash }).expect(201)).body.data;
    const preflightEvent = publish.mock.calls.at(-1)![0];
    await request(app.getHttpServer()).post(`/api/extensions/runs/${started.runId}/complete`).send({
      completionToken: preflightEvent.completionToken, status: 'SUCCEEDED',
      output: { action: 'UPDATE', remotePath: 'docs/source.pdf', remoteVersion: '"download-v1"', remoteHash },
    }).expect(201);
    const ready = (await request(app.getHttpServer()).get(`/api/extensions/sync/preflights/${prepared.sessionId}`).expect(200)).body.data;
    const committing = (await request(app.getHttpServer())
      .post(`/api/extensions/sync/preflights/${prepared.sessionId}/commit`)
      .send({ preflightHash: ready.preflight.preflightHash, resolutions: [{ itemKey: source.id, resolution: 'CREATE_COPY' }] })
      .expect(201)).body.data;
    const downloadEvent = publish.mock.calls.at(-1)![0];
    expect(downloadEvent).toMatchObject({
      operation: 'CLOUD_DOWNLOAD_COMMIT',
      payload: { expectedHash: remoteHash, expectedVersion: '"download-v1"' },
    });
    await request(app.getHttpServer()).post(`/api/extensions/runs/${committing.runId}/complete`).send({
      completionToken: downloadEvent.completionToken, status: 'SUCCEEDED',
      output: {
        remotePath: 'docs/source.pdf', remoteVersion: '"download-v2"', sha256: remoteHash,
        contentBase64: remote.toString('base64'),
      },
    }).expect(400).expect(({ body }) => expect(body.error.code).toBe('EXTERNAL_SYNC_OUTPUT_INVALID'));
    await request(app.getHttpServer()).post(`/api/extensions/runs/${committing.runId}/complete`).send({
      completionToken: downloadEvent.completionToken, status: 'SUCCEEDED',
      output: {
        remotePath: 'docs/source.pdf', remoteVersion: '"download-v1"', sha256: remoteHash,
        contentBase64: remote.toString('base64'),
      },
    }).expect(201);
    const link = await prisma.externalObjectLink.findUniqueOrThrow({
      where: { profileId_remoteId: { profileId: profile.id, remoteId: 'docs/source.pdf' } },
    });
    expect(link.localId).not.toBe(source.id);
    const copy = await prisma.fileAsset.findUniqueOrThrow({ where: { id: link.localId }, include: { versions: true } });
    expect(copy).toMatchObject({ projectId: project.id, documentId: null, meetingId: null, partnerId: null });
    expect(copy.versions).toHaveLength(1);
    expect(copy.versions[0]).toMatchObject({ sha256: remoteHash, size: remote.length });
    storageKeys.push(copy.versions[0]!.storageKey);
    await expect(storage.read(copy.versions[0]!.storageKey)).resolves.toMatchObject({ content: remote });
    publish.mockRestore();
  });
});
