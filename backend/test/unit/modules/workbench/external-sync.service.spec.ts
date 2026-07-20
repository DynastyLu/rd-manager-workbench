import {
  ExternalSyncService,
  normalizeExternalPath,
  sameOrigin,
} from '../../../../src/modules/workbench/extensions/application/external-sync.service';

describe('ExternalSyncService authoritative prepare', () => {
  function fixture(overrides: Record<string, unknown> = {}) {
    const prisma = {
      extensionProfile: { findFirst: jest.fn() },
      externalSyncSession: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      fileAsset: { findFirst: jest.fn() },
      externalObjectLink: { findUnique: jest.fn().mockResolvedValue(null) },
      ...overrides,
    } as any;
    const extensions = {
      prepareRun: jest.fn().mockResolvedValue({
        operation: 'CALENDAR_SYNC_PREFLIGHT', inputSha256: 'a'.repeat(64), inputBytes: 100,
        confirmationHash: 'b'.repeat(64), requiresConfirmation: true,
      }),
    } as any;
    return {
      prisma,
      extensions,
      service: new ExternalSyncService(prisma, extensions, { publishRunRequested: jest.fn() } as any, {} as any, {} as any),
    };
  }

  it('builds a calendar provider request only from a server-validated range', async () => {
    const f = fixture();
    f.prisma.extensionProfile.findFirst.mockResolvedValue({
      id: 'profile-1', kind: 'CALENDAR', provider: 'CALDAV', enabled: true,
      publicConfig: { baseUrl: 'https://dav.example.com', calendarPath: '/calendar/', syncDirection: 'PULL_ONLY' },
    });
    const result = await f.service.prepare({
      profileId: 'profile-1',
      target: { type: 'CALENDAR', startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-21T00:00:00.000Z' },
    });
    expect(result).toMatchObject({ sessionId: expect.any(String), confirmationHash: 'b'.repeat(64) });
    expect(f.extensions.prepareRun).toHaveBeenCalledWith('profile-1', expect.objectContaining({
      operation: 'CALENDAR_SYNC_PREFLIGHT',
      payload: expect.objectContaining({ startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-21T00:00:00.000Z' }),
    }));
    expect(JSON.stringify(f.extensions.prepareRun.mock.calls)).not.toContain('remoteHash');
  });

  it('uses the latest FileVersion SHA-256 and stored remote version instead of client supplied facts', async () => {
    const f = fixture();
    f.prisma.extensionProfile.findFirst.mockResolvedValue({
      id: 'profile-file', kind: 'CLOUD_DRIVE', provider: 'WEBDAV', enabled: true,
      publicConfig: { baseUrl: 'https://dav.example.com', remoteRoot: '/workbench/' },
    });
    f.prisma.fileAsset.findFirst.mockResolvedValue({
      id: 'file-1', status: 'ACTIVE', versions: [{ sha256: 'c'.repeat(64) }],
    });
    f.prisma.externalObjectLink.findUnique.mockResolvedValue({ remoteVersion: '"trusted-v1"' });
    f.extensions.prepareRun.mockResolvedValue({
      operation: 'CLOUD_UPLOAD_PREFLIGHT', inputSha256: 'd'.repeat(64), inputBytes: 100,
      confirmationHash: 'e'.repeat(64), requiresConfirmation: true,
    });
    await f.service.prepare({
      profileId: 'profile-file',
      target: { type: 'FILE', fileAssetId: 'file-1', remotePath: 'docs/file.txt', mode: 'UPLOAD' },
    });
    expect(f.extensions.prepareRun).toHaveBeenCalledWith('profile-file', expect.objectContaining({
      payload: expect.objectContaining({
        localId: 'file-1', localHash: 'c'.repeat(64), remoteVersion: '"trusted-v1"', remotePath: 'docs/file.txt',
      }),
    }));
  });

  it('rejects path traversal, absolute local paths and cross-host redirects', () => {
    expect(() => normalizeExternalPath('../backup.zip')).toThrow('External path is invalid');
    expect(() => normalizeExternalPath('/etc/passwd')).toThrow('External path is invalid');
    expect(() => normalizeExternalPath('%2e%2e/secret')).toThrow('External path is invalid');
    expect(normalizeExternalPath('backups/2026-07.zip')).toBe('backups/2026-07.zip');
    expect(sameOrigin('https://dav.example.com/a', 'https://dav.example.com/b')).toBe(true);
    expect(sameOrigin('https://dav.example.com/a', 'https://evil.example/b')).toBe(false);
  });

  it('claims a draft preflight before creating a provider run so concurrent starts cannot execute twice', async () => {
    const f = fixture();
    f.prisma.externalSyncSession.findFirst.mockResolvedValue({
      id: 'session-1', profileId: 'profile-1', status: 'DRAFT',
      request: { type: 'CALENDAR', startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-21T00:00:00.000Z' },
      expiresAt: new Date(Date.now() + 60_000),
    });
    f.prisma.externalSyncSession.updateMany.mockResolvedValue({ count: 0 });
    f.prisma.extensionProfile.findFirst.mockResolvedValue({
      id: 'profile-1', kind: 'CALENDAR', provider: 'CALDAV', enabled: true,
      publicConfig: { baseUrl: 'https://dav.example.com', calendarPath: '/calendar/', syncDirection: 'PULL_ONLY' },
    });
    f.extensions.startRun = jest.fn().mockResolvedValue({ id: 'run-1', completionToken: 'token' });

    await expect(f.service.startPreflight('session-1', 'b'.repeat(64)))
      .rejects.toMatchObject({ code: 'EXTERNAL_SYNC_CONFLICT' });
    expect(f.extensions.startRun).not.toHaveBeenCalled();
  });

  it('claims a ready sync session before applying local decisions so concurrent commits cannot duplicate objects', async () => {
    const completion = { commitCalendarLocally: jest.fn() };
    const f = fixture();
    f.service = new ExternalSyncService(
      f.prisma, f.extensions, { publishRunRequested: jest.fn() } as any, {} as any, completion as any,
    );
    const preflight = {
      sessionId: 'session-1', profileId: 'profile-1', provider: 'CALDAV', targetType: 'CALENDAR',
      direction: 'PULL_ONLY', items: [], expiresAt: new Date(Date.now() + 60_000).toISOString(),
      preflightHash: 'c'.repeat(64),
    };
    f.prisma.externalSyncSession.findFirst.mockResolvedValue({
      id: 'session-1', profileId: 'profile-1', status: 'READY',
      request: { type: 'CALENDAR', startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-21T00:00:00.000Z' },
      preflight, preflightHash: preflight.preflightHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    f.prisma.externalSyncSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(f.service.commit('session-1', { preflightHash: preflight.preflightHash, resolutions: [] }))
      .rejects.toMatchObject({ code: 'EXTERNAL_SYNC_CONFLICT' });
    expect(completion.commitCalendarLocally).not.toHaveBeenCalled();
  });

  it('rechecks the exact approved file hash while building an upload commit payload', async () => {
    const f = fixture({
      fileVersion: { findFirst: jest.fn().mockResolvedValue({ sha256: 'a'.repeat(64) }) },
    });
    const storage = { read: jest.fn().mockResolvedValue({ content: Buffer.from('new body') }) };
    f.service = new ExternalSyncService(
      f.prisma, f.extensions, { publishRunRequested: jest.fn() } as any, storage as any, {} as any,
    );
    const preflight = {
      sessionId: 'session-file', profileId: 'profile-file', provider: 'WEBDAV', targetType: 'FILE',
      direction: 'BIDIRECTIONAL', expiresAt: new Date(Date.now() + 60_000).toISOString(),
      preflightHash: 'c'.repeat(64),
      items: [{
        itemKey: 'file-1', localType: 'FILE_ASSET', localId: 'file-1', remoteId: 'docs/file.txt',
        localHash: 'a'.repeat(64), action: 'UPDATE', allowedResolutions: ['KEEP_LOCAL'],
      }],
    };
    f.prisma.externalSyncSession.findFirst.mockResolvedValue({
      id: 'session-file', profileId: 'profile-file', status: 'READY',
      request: { type: 'FILE', fileAssetId: 'file-1', remotePath: 'docs/file.txt', mode: 'UPLOAD' },
      preflight, preflightHash: preflight.preflightHash, expiresAt: new Date(Date.now() + 60_000),
    });
    f.prisma.extensionProfile.findFirst.mockResolvedValue({
      id: 'profile-file', provider: 'WEBDAV', enabled: true,
      publicConfig: { baseUrl: 'https://dav.example.com', remoteRoot: '/workbench/' },
    });
    f.prisma.fileAsset.findFirst.mockResolvedValue({
      id: 'file-1', status: 'ACTIVE', versions: [{ sha256: 'b'.repeat(64), storageKey: 'files/file-1/v2' }],
    });

    await expect(f.service.commit('session-file', {
      preflightHash: preflight.preflightHash,
      resolutions: [{ itemKey: 'file-1', resolution: 'KEEP_LOCAL' }],
    })).rejects.toMatchObject({ code: 'EXTERNAL_SYNC_CONFLICT' });
    expect(storage.read).not.toHaveBeenCalled();
    expect(f.extensions.prepareRun).not.toHaveBeenCalled();
  });
});
