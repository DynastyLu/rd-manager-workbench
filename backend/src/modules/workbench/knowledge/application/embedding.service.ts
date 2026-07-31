import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import {
  dirname,
  join,
  resolve,
  sep,
  win32,
} from 'node:path';
import { pathToFileURL } from 'node:url';
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingCache } from '../domain/embedding-cache';
import { FilesystemResponseCache } from '../infrastructure/filesystem-response-cache';

const BATCH_SIZE = 20;
const EMBEDDING_DIMENSION = 384;
const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const MODEL_UNAVAILABLE_MESSAGE = '本地语义模型尚未准备或运行库不可用，请启用后重试。';
const MODEL_INFERENCE_ERROR_MESSAGE = '本地语义检索暂时不可用，当前继续使用全文检索。';

interface TensorLike {
  tolist(): unknown;
}

interface TransformersModule {
  env: {
    useCustomCache: boolean;
    customCache: FilesystemResponseCache | null;
    useFSCache: boolean;
    useBrowserCache: boolean;
  };
  pipeline(
    task: 'feature-extraction',
    modelId: string,
    options: {
      cache_dir: string;
      local_files_only: boolean;
      dtype: 'q8';
      device?: 'cpu';
    },
  ): Promise<unknown>;
}

interface OnnxWebModule {
  env: {
    wasm: {
      wasmPaths?: string;
      proxy?: boolean;
    };
  };
}

export type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<TensorLike>;

export type EmbeddingBackend = 'native' | 'wasm';

export interface EmbeddingLoadRequest {
  allowRemote: boolean;
  backend: EmbeddingBackend;
  cacheDirectory: string;
}

export type EmbeddingModelLoader = (
  request: EmbeddingLoadRequest,
) => Promise<FeatureExtractor>;

export type ModelState = 'UNAVAILABLE' | 'DOWNLOADING' | 'LOADING' | 'READY' | 'ERROR';

export interface EmbeddingServiceOptions {
  platform: NodeJS.Platform;
  architecture: string;
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>;
  homeDirectory: string;
}

const DEFAULT_OPTIONS: EmbeddingServiceOptions = {
  platform: process.platform,
  architecture: process.arch,
  environment: process.env,
  homeDirectory: homedir(),
};

function getBackendOrder(
  platform: NodeJS.Platform,
  architecture: string,
): EmbeddingBackend[] {
  if (platform === 'win32' && !['x64', 'arm64'].includes(architecture)) {
    return ['wasm'];
  }
  return ['native', 'wasm'];
}

function getCacheDirectory(options: EmbeddingServiceOptions): string {
  const override = options.environment.LOCAL_AI_MODEL_CACHE?.trim();
  const pathApi = options.platform === 'win32' ? win32 : { join, resolve };
  if (override) return pathApi.resolve(override);

  if (options.platform === 'win32') {
    const localAppData = options.environment.LOCALAPPDATA?.trim()
      || win32.join(options.homeDirectory, 'AppData', 'Local');
    return win32.join(
      localAppData,
      'RD Manager Workbench',
      'models',
      'embeddings',
    );
  }
  if (options.platform === 'darwin') {
    return join(
      options.homeDirectory,
      'Library',
      'Caches',
      'RD Manager Workbench',
      'models',
      'embeddings',
    );
  }
  const xdgCache = options.environment.XDG_CACHE_HOME?.trim()
    || join(options.homeDirectory, '.cache');
  return join(xdgCache, 'rd-manager-workbench', 'models', 'embeddings');
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly loader: EmbeddingModelLoader;
  private readonly options: EmbeddingServiceOptions;
  private readonly cacheDirectory: string;
  private modelPromise: Promise<FeatureExtractor> | null = null;
  private preparationPromise: Promise<void> | null = null;
  private persistenceCache: FilesystemResponseCache | null = null;
  private state: ModelState = 'UNAVAILABLE';
  private runtime: EmbeddingBackend | null = null;
  private lastError: string | null = null;
  private unavailableLogged = false;

  constructor(
    private readonly cache: EmbeddingCache,
    loader?: EmbeddingModelLoader,
    options: EmbeddingServiceOptions = DEFAULT_OPTIONS,
  ) {
    this.options = options;
    this.cacheDirectory = getCacheDirectory(options);
    this.loader = loader ?? ((request) => this.loadTransformersModel(request));
  }

  async embed(texts: string[]): Promise<(number[] | null)[]> {
    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    const uncached: Array<{ text: string; index: number }> = [];
    texts.forEach((text, index) => {
      const cached = this.cache.get(text);
      if (cached?.length === EMBEDDING_DIMENSION) results[index] = cached;
      else uncached.push({ text, index });
    });
    if (uncached.length === 0) return results;

    let extractor: FeatureExtractor;
    try {
      extractor = await this.getModel(false);
    } catch {
      this.logUnavailableOnce();
      return results;
    }

    for (let offset = 0; offset < uncached.length; offset += BATCH_SIZE) {
      const batch = uncached.slice(offset, offset + BATCH_SIZE);
      try {
        const output = await extractor(
          batch.map((item) => item.text),
          { pooling: 'mean', normalize: true },
        );
        const vectors = output.tolist();
        if (!Array.isArray(vectors)) throw new Error('Embedding model returned an invalid tensor');
        batch.forEach((item, batchIndex) => {
          const vector = vectors[batchIndex];
          if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) return;
          const normalized = vector.map(Number);
          results[item.index] = normalized;
          this.cache.set(item.text, normalized);
        });
      } catch {
        this.state = 'ERROR';
        this.lastError = MODEL_INFERENCE_ERROR_MESSAGE;
        this.logger.error(
          { offset },
          '本地向量计算失败，当前批次继续使用全文检索。',
        );
      }
    }

    return results;
  }

  async prepare(): Promise<void> {
    if (this.preparationPromise) return this.preparationPromise;
    const preparation = this.prepareModel();
    this.preparationPromise = preparation;
    try {
      await preparation;
    } finally {
      if (this.preparationPromise === preparation) this.preparationPromise = null;
    }
  }

  private async prepareModel(): Promise<void> {
    this.modelPromise = null;
    this.runtime = null;
    this.persistenceCache = null;
    this.state = 'DOWNLOADING';
    this.lastError = null;
    this.unavailableLogged = false;
    try {
      await this.getModel(true);
    } catch {
      this.logUnavailableOnce();
    }
  }

  getStatus() {
    return {
      state: this.state,
      ready: this.state === 'READY',
      modelId: MODEL_ID,
      dimension: EMBEDDING_DIMENSION,
      runtime: this.runtime,
      lastError: this.lastError,
      persistence: this.persistenceCache?.getPersistenceStatus() ?? {
        state: 'UNKNOWN' as const,
        durable: null,
        message: null,
      },
    };
  }

  private async getModel(allowRemote: boolean): Promise<FeatureExtractor> {
    if (!this.modelPromise) {
      this.state = allowRemote ? 'DOWNLOADING' : 'LOADING';
      this.modelPromise = this.loadPreferredRuntime(allowRemote)
        .then(({ extractor, backend }) => {
          this.state = 'READY';
          this.runtime = backend;
          this.lastError = null;
          this.unavailableLogged = false;
          return extractor;
        })
        .catch((error: unknown) => {
          this.modelPromise = null;
          this.runtime = null;
          this.state = allowRemote ? 'ERROR' : 'UNAVAILABLE';
          this.lastError = MODEL_UNAVAILABLE_MESSAGE;
          throw error;
        });
    }
    return this.modelPromise;
  }

  private async loadPreferredRuntime(
    allowRemote: boolean,
  ): Promise<{ extractor: FeatureExtractor; backend: EmbeddingBackend }> {
    let lastFailure: unknown;
    for (const backend of getBackendOrder(
      this.options.platform,
      this.options.architecture,
    )) {
      try {
        const extractor = await this.loader({
          allowRemote,
          backend,
          cacheDirectory: this.cacheDirectory,
        });
        return { extractor, backend };
      } catch (error) {
        lastFailure = error;
      }
    }
    throw lastFailure ?? new Error('No local embedding runtime is available');
  }

  private logUnavailableOnce(): void {
    if (this.unavailableLogged) return;
    this.unavailableLogged = true;
    this.logger.warn('本地向量模型不可用，当前继续使用全文检索。');
  }

  private async loadTransformersModel(
    request: EmbeddingLoadRequest,
  ): Promise<FeatureExtractor> {
    const persistenceCache = new FilesystemResponseCache(request.cacheDirectory);
    this.persistenceCache = persistenceCache;
    await persistenceCache.verifyWritable();
    const transformers = request.backend === 'native'
      ? await import('@huggingface/transformers') as unknown as TransformersModule
      : await this.loadWasmTransformers(persistenceCache);
    const extractor = await transformers.pipeline(
      'feature-extraction',
      MODEL_ID,
      {
        cache_dir: request.cacheDirectory,
        local_files_only: !request.allowRemote,
        dtype: 'q8',
        ...(request.backend === 'native' ? { device: 'cpu' as const } : {}),
      },
    );
    return extractor as FeatureExtractor;
  }

  private async loadWasmTransformers(
    persistenceCache = new FilesystemResponseCache(this.cacheDirectory),
  ): Promise<TransformersModule> {
    this.persistenceCache = persistenceCache;
    if (persistenceCache.getPersistenceStatus().state === 'UNKNOWN') {
      await persistenceCache.verifyWritable();
    }
    const transformersEntry = require.resolve('@huggingface/transformers');
    const transformersRequire = createRequire(transformersEntry);
    const onnxWeb = transformersRequire('onnxruntime-web') as OnnxWebModule;
    const onnxWebEntry = transformersRequire.resolve('onnxruntime-web');
    onnxWeb.env.wasm.wasmPaths = `${dirname(onnxWebEntry)}${sep}`;
    onnxWeb.env.wasm.proxy = false;

    const runtimeSymbol = Symbol.for('onnxruntime');
    const runtimeGlobal = globalThis as typeof globalThis & {
      [runtimeSymbol]?: OnnxWebModule;
    };
    const previousRuntime = runtimeGlobal[runtimeSymbol];
    runtimeGlobal[runtimeSymbol] = onnxWeb;

    const webEntry = join(dirname(transformersEntry), 'transformers.web.js');
    const importEsm = new Function(
      'specifier',
      'return import(specifier)',
    ) as (specifier: string) => Promise<TransformersModule>;
    try {
      const transformers = await importEsm(pathToFileURL(webEntry).href);
      transformers.env.useCustomCache = true;
      transformers.env.customCache = persistenceCache;
      transformers.env.useFSCache = false;
      transformers.env.useBrowserCache = false;
      return transformers;
    } finally {
      if (previousRuntime) runtimeGlobal[runtimeSymbol] = previousRuntime;
      else delete runtimeGlobal[runtimeSymbol];
    }
  }
}
