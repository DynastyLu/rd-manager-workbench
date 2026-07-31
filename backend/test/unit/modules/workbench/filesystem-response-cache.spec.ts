import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemResponseCache } from '../../../../src/modules/workbench/knowledge/infrastructure/filesystem-response-cache';

describe('FilesystemResponseCache', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function temporaryDirectory() {
    const directory = await mkdtemp(join(tmpdir(), 'rd-model-cache-'));
    directories.push(directory);
    return directory;
  }

  it('persists a response body and headers for a new cache instance after restart', async () => {
    const directory = await temporaryDirectory();
    const key = 'https://huggingface.co/model/resolve/main/config.json';
    const firstProcess = new FilesystemResponseCache(directory);

    await firstProcess.put(
      key,
      new Response('{"model":"cached"}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          etag: '"model-v1"',
        },
      }),
    );

    const restartedProcess = new FilesystemResponseCache(directory);
    const cached = await restartedProcess.match(key);

    expect(cached).toBeDefined();
    await expect(cached!.text()).resolves.toBe('{"model":"cached"}');
    expect(cached!.status).toBe(200);
    expect(cached!.headers.get('content-type')).toBe('application/json');
    expect(cached!.headers.get('etag')).toBe('"model-v1"');
  });

  it('treats a corrupt metadata entry as a cache miss', async () => {
    const directory = await temporaryDirectory();
    const cache = new FilesystemResponseCache(directory);
    await cache.put('https://example.test/model.bin', new Response('model'));
    const cacheFile = (await readdir(directory)).find((file) => file.endsWith('.cache'));
    expect(cacheFile).toBeDefined();
    await writeFile(join(directory, cacheFile!), '{not-json', 'utf8');

    await expect(new FilesystemResponseCache(directory).match(
      'https://example.test/model.bin',
    )).resolves.toBeUndefined();
  });

  it('does not retain an entry larger than the configured cache limit', async () => {
    const directory = await temporaryDirectory();
    const cache = new FilesystemResponseCache(directory, { maxEntryBytes: 4 });

    await expect(
      cache.put('https://example.test/large-model.bin', new Response('12345')),
    ).resolves.toBeUndefined();
    await expect(cache.match('https://example.test/large-model.bin')).resolves.toBeUndefined();
  });

  it('commits each cache entry as one atomically replaceable file', async () => {
    const directory = await temporaryDirectory();
    const cache = new FilesystemResponseCache(directory);

    await cache.put('https://example.test/model.bin', new Response('model'));

    expect(await readdir(directory)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}\.cache$/),
    ]);
  });

  it('reports a safe degraded persistence state when the cache directory is not writable', async () => {
    const parent = await temporaryDirectory();
    const fileInsteadOfDirectory = join(parent, 'not-a-directory');
    await writeFile(fileInsteadOfDirectory, 'occupied', 'utf8');
    const cache = new FilesystemResponseCache(fileInsteadOfDirectory);

    await cache.put('https://example.test/model.bin', new Response('model'));

    expect(cache.getPersistenceStatus()).toEqual({
      state: 'DEGRADED',
      durable: false,
      message: '模型本次可用，但未能持久化到本机；重启后可能需要重新下载。',
    });
    expect(JSON.stringify(cache.getPersistenceStatus())).not.toContain(parent);
  });
});
