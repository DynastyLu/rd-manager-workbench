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

  it('reports storage stats and walks entries in stable key order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backend-core-storage-'));
    const adapter = new LocalStorageAdapter(root);
    await adapter.write({ key: 'files/b.txt', content: Buffer.from('bb'), mimeType: 'text/plain' });
    await adapter.write({ key: 'files/a.txt', content: Buffer.from('a'), mimeType: 'text/plain' });

    await expect(adapter.stat('files/a.txt')).resolves.toMatchObject({
      key: 'files/a.txt',
      byteSize: 1,
      kind: 'FILE',
    });
    await expect(adapter.walk('files')).resolves.toMatchObject([
      { key: 'files/a.txt', byteSize: 1, kind: 'FILE' },
      { key: 'files/b.txt', byteSize: 2, kind: 'FILE' },
    ]);
    const filesystem = await adapter.statfs();
    expect(filesystem.availableBytes).toBeGreaterThan(0n);
    expect(filesystem.totalBytes).toBeGreaterThanOrEqual(filesystem.availableBytes);

    await rm(root, { recursive: true, force: true });
  });
});
