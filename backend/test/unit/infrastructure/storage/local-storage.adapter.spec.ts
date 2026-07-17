import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from '../../../../src/infrastructure/storage/local-storage.adapter';

describe('LocalStorageAdapter', () => {
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
