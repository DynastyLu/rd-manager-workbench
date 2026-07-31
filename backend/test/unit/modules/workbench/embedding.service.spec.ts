import {
  EmbeddingBackend,
  EmbeddingModelLoader,
  EmbeddingService,
} from '../../../../src/modules/workbench/knowledge/application/embedding.service';
import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { EmbeddingCache } from '../../../../src/modules/workbench/knowledge/domain/embedding-cache';

const execFileAsync = promisify(execFile);

describe('EmbeddingService', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache();
  });

  function makeLoader(vectorValue = 0.1) {
    const extractor = jest.fn(async (texts: string[]) => ({
      tolist: () => texts.map(() => Array(384).fill(vectorValue)),
    }));
    const loader = jest.fn(async () => extractor) as unknown as EmbeddingModelLoader;
    return { loader, extractor };
  }

  it('uses a local 384-dimensional model and caches embeddings by content', async () => {
    const { loader, extractor } = makeLoader();
    const service = new EmbeddingService(cache, loader);

    const first = await service.embed(['你好，研发计划']);
    const second = await service.embed(['你好，研发计划']);

    expect(first).toEqual(second);
    expect(first[0]).toHaveLength(384);
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({
      allowRemote: false,
      backend: 'native',
    }));
    expect(extractor).toHaveBeenCalledTimes(1);
  });

  it('batches local inference into groups of 20', async () => {
    const { loader, extractor } = makeLoader();
    const service = new EmbeddingService(cache, loader);

    await service.embed(Array.from({ length: 45 }, (_, index) => `text ${index}`));

    expect(extractor).toHaveBeenCalledTimes(3);
    expect(extractor.mock.calls.map((call) => call[0].length)).toEqual([20, 20, 5]);
  });

  it('does not make a network request when the local model is unavailable', async () => {
    const loader = jest.fn(async ({ allowRemote }: { allowRemote: boolean }) => {
      expect(allowRemote).toBe(false);
      throw new Error('model not cached');
    }) as unknown as EmbeddingModelLoader;
    const service = new EmbeddingService(cache, loader);

    await expect(service.embed(['text'])).resolves.toEqual([null]);
    expect(service.getStatus()).toMatchObject({ state: 'UNAVAILABLE', ready: false });
  });

  it('downloads the model only through the explicit prepare action', async () => {
    const { loader } = makeLoader(0.2);
    const service = new EmbeddingService(cache, loader);

    await service.prepare();

    expect(loader).toHaveBeenCalledWith(expect.objectContaining({
      allowRemote: true,
      backend: 'native',
    }));
    expect(service.getStatus()).toMatchObject({ state: 'READY', ready: true, dimension: 384 });
  });

  it('shares one in-flight preparation instead of loading the model twice', async () => {
    let releaseLoader!: () => void;
    const loaderGate = new Promise<void>((resolve) => {
      releaseLoader = resolve;
    });
    const { extractor } = makeLoader();
    const loader = jest.fn(async () => {
      await loaderGate;
      return extractor;
    }) as unknown as EmbeddingModelLoader;
    const service = new EmbeddingService(cache, loader);

    const first = service.prepare();
    const second = service.prepare();
    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(1);
    releaseLoader();
    await Promise.all([first, second]);
    expect(service.getStatus()).toMatchObject({ state: 'READY', ready: true });
  });

  it.each(['x64', 'arm64'] as const)(
    'prefers native inference on Windows %s and falls back to WASM when the binding cannot load',
    async (architecture) => {
      const extractor = jest.fn(async (texts: string[]) => ({
        tolist: () => texts.map(() => Array(384).fill(0.3)),
      }));
      const backends: EmbeddingBackend[] = [];
      const loader = jest.fn(async (request: { backend: EmbeddingBackend }) => {
        backends.push(request.backend);
        if (request.backend === 'native') {
          throw new Error('The specified module could not be found: onnxruntime_binding.node');
        }
        return extractor;
      }) as unknown as EmbeddingModelLoader;
      const service = new EmbeddingService(cache, loader, {
        platform: 'win32',
        architecture,
        environment: {},
        homeDirectory: 'C:\\Users\\test-user',
      });

      await service.prepare();

      expect(backends).toEqual(['native', 'wasm']);
      expect(service.getStatus()).toMatchObject({
        state: 'READY',
        ready: true,
        runtime: 'wasm',
      });
    },
  );

  it('uses the configured cache override and otherwise chooses a stable Windows user cache', async () => {
    const seenDirectories: string[] = [];
    const { extractor } = makeLoader();
    const loader = jest.fn(async (request: { cacheDirectory: string }) => {
      seenDirectories.push(request.cacheDirectory);
      return extractor;
    }) as unknown as EmbeddingModelLoader;

    await new EmbeddingService(cache, loader, {
      platform: 'win32',
      architecture: 'x64',
      environment: { LOCAL_AI_MODEL_CACHE: 'D:\\local-models' },
      homeDirectory: 'C:\\Users\\test-user',
    }).prepare();
    await new EmbeddingService(new EmbeddingCache(), loader, {
      platform: 'win32',
      architecture: 'arm64',
      environment: { LOCALAPPDATA: 'C:\\Users\\test-user\\AppData\\Local' },
      homeDirectory: 'C:\\Users\\test-user',
    }).prepare();

    expect(seenDirectories).toEqual([
      'D:\\local-models',
      'C:\\Users\\test-user\\AppData\\Local\\RD Manager Workbench\\models\\embeddings',
    ]);
  });

  it(
    'configures the real WASM module with a disk cache that survives a service restart',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'rd-wasm-model-cache-'));
      try {
        const script = `
        const serviceModule = await import('./src/modules/workbench/knowledge/application/embedding.service.ts');
        const cacheModule = await import('./src/modules/workbench/knowledge/domain/embedding-cache.ts');
        const EmbeddingService = serviceModule.EmbeddingService ?? serviceModule.default.EmbeddingService;
        const EmbeddingCache = cacheModule.EmbeddingCache ?? cacheModule.default.EmbeddingCache;
        const options = {
          platform: process.platform,
          architecture: process.arch,
          environment: { LOCAL_AI_MODEL_CACHE: ${JSON.stringify(directory)} },
          homeDirectory: ${JSON.stringify(tmpdir())},
        };
        const firstService = new EmbeddingService(new EmbeddingCache(), undefined, options);
        const firstModule = await firstService.loadWasmTransformers();
        if (firstModule.env.useCustomCache !== true) throw new Error('custom cache not enabled');
        const key = 'https://huggingface.co/model/resolve/main/config.json';
        await firstModule.env.customCache.put(key, new Response('persisted model part'));
        const firstCache = firstModule.env.customCache;
        const restartedService = new EmbeddingService(new EmbeddingCache(), undefined, options);
        const restartedModule = await restartedService.loadWasmTransformers();
        if (restartedModule.env.customCache === firstCache) throw new Error('cache was not recreated');
        const cached = await restartedModule.env.customCache.match(key);
        if (!cached || await cached.text() !== 'persisted model part') {
          throw new Error('persisted model part was not available offline');
        }
        process.stdout.write('persistent-wasm-cache-ok');
      `;
        const { stdout } = await execFileAsync(
          process.execPath,
          ['--import', 'tsx', '--input-type=module', '--eval', script],
          { cwd: process.cwd() },
        );

        expect(stdout).toContain('persistent-wasm-cache-ok');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    15_000,
  );

  it('sanitizes loader errors and logs model unavailability only once until an explicit retry', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const loader = jest.fn(async () => {
      throw new Error(
        "Cannot find module 'onnxruntime_binding.node'\n" +
        'Require stack:\n' +
        '- C:\\Users\\secret\\app\\node_modules\\onnxruntime-node\\index.js',
      );
    }) as unknown as EmbeddingModelLoader;
    const service = new EmbeddingService(cache, loader, {
      platform: 'win32',
      architecture: 'x64',
      environment: {},
      homeDirectory: 'C:\\Users\\secret',
    });

    await expect(service.embed(['first'])).resolves.toEqual([null]);
    await expect(service.embed(['second'])).resolves.toEqual([null]);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toMatchObject({
      state: 'UNAVAILABLE',
      ready: false,
      lastError: '本地语义模型尚未准备或运行库不可用，请启用后重试。',
    });
    expect(JSON.stringify(service.getStatus())).not.toContain('Require stack');
    expect(JSON.stringify(service.getStatus())).not.toContain('C:\\Users\\secret');

    await service.prepare();

    expect(warning).toHaveBeenCalledTimes(2);
    expect(service.getStatus()).toMatchObject({
      state: 'ERROR',
      ready: false,
      lastError: '本地语义模型尚未准备或运行库不可用，请启用后重试。',
    });
  });
});
