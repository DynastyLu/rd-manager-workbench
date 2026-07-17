import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from '../../../../src/infrastructure/storage/local-storage.adapter';

describe('LocalStorageAdapter', () => {
  it('creates and verifies the configured storage root without writing a data file', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'backend-core-storage-'));
    const root = join(parent, 'storage-root');
    const adapter = new LocalStorageAdapter(root);

    await adapter.checkHealth();

    await expect(access(root)).resolves.toBeUndefined();
    await rm(parent, { recursive: true, force: true });
  });

  it('writes and reads a file by storage key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backend-core-storage-'));
    const adapter = new LocalStorageAdapter(root);

    const saved = await adapter.write({
      key: 'jobs/job-1/result.txt',
      content: Buffer.from('hello'),
      mimeType: 'text/plain',
    });

    const read = await adapter.read(saved.storageKey);
    expect(read.content.toString()).toBe('hello');
    expect(read.mimeType).toBe('text/plain');

    await rm(root, { recursive: true, force: true });
  });
});
