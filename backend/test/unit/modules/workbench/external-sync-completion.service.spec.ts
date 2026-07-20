import { createHash } from 'node:crypto';
import { ExternalSyncCompletionService } from '../../../../src/modules/workbench/extensions/application/external-sync-completion.service';

describe('ExternalSyncCompletionService local write integrity', () => {
  it('does not overwrite a file that changed after the approved download preflight', async () => {
    const bytes = Buffer.from('remote body');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const preflight = {
      sessionId: 'session-1', profileId: 'profile-1', provider: 'WEBDAV', targetType: 'FILE',
      direction: 'BIDIRECTIONAL', expiresAt: new Date(Date.now() + 60_000).toISOString(), preflightHash: 'f'.repeat(64),
      items: [{
        itemKey: 'file-1', localType: 'FILE_ASSET', localId: 'file-1', remoteId: 'docs/file.txt',
        remoteVersion: '"v1"', localHash: 'a'.repeat(64), remoteHash: digest,
        action: 'CONFLICT', allowedResolutions: ['KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY'],
      }],
    };
    const prisma = {
      externalSyncSession: { findFirst: jest.fn().mockResolvedValue({
        id: 'session-1', profileId: 'profile-1', targetType: 'FILE', commitRunId: 'run-1',
        request: { fileAssetId: 'file-1' }, preflight,
        resolutions: [{ itemKey: 'file-1', resolution: 'KEEP_REMOTE' }],
        profile: { provider: 'WEBDAV', publicConfig: {} },
      }) },
      fileAsset: { findFirst: jest.fn().mockResolvedValue({ id: 'file-1', name: 'file.txt' }) },
    };
    const storage = { write: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) };
    const service = new ExternalSyncCompletionService(prisma as any, storage as any);
    const prepared = await service.prepare({ id: 'run-1', operation: 'CLOUD_DOWNLOAD_COMMIT' } as any, {
      completionToken: 'token', status: 'SUCCEEDED',
      output: {
        remotePath: 'docs/file.txt', remoteVersion: '"v1"', sha256: digest,
        contentBase64: bytes.toString('base64'),
      },
    });
    const tx = {
      fileVersion: {
        findFirst: jest.fn().mockResolvedValue({ sha256: 'b'.repeat(64) }),
        aggregate: jest.fn(), create: jest.fn(),
      },
      externalObjectLink: { upsert: jest.fn() },
      externalSyncSession: { update: jest.fn() },
    };

    await expect(prepared!.apply(tx as any)).rejects.toMatchObject({ code: 'EXTERNAL_SYNC_CONFLICT' });
    expect(tx.fileVersion.create).not.toHaveBeenCalled();
    await prepared!.rollback();
    expect(storage.delete).toHaveBeenCalled();
  });
});
