import { resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingCache } from '../domain/embedding-cache';

const BATCH_SIZE = 20;
const EMBEDDING_DIMENSION = 384;
const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

interface TensorLike {
  tolist(): unknown;
}

export type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<TensorLike>;

export type EmbeddingModelLoader = (allowRemote: boolean) => Promise<FeatureExtractor>;

type ModelState = 'UNAVAILABLE' | 'DOWNLOADING' | 'LOADING' | 'READY' | 'ERROR';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly loader: EmbeddingModelLoader;
  private modelPromise: Promise<FeatureExtractor> | null = null;
  private state: ModelState = 'UNAVAILABLE';
  private lastError: string | null = null;

  constructor(
    private readonly cache: EmbeddingCache,
    loader?: EmbeddingModelLoader,
  ) {
    this.loader = loader ?? ((allowRemote) => this.loadTransformersModel(allowRemote));
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
    } catch (error) {
      this.state = 'UNAVAILABLE';
      this.lastError = error instanceof Error ? error.message : 'Local embedding model unavailable';
      this.logger.warn('本地向量模型尚未准备，当前使用全文检索。');
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
      } catch (error) {
        this.state = 'ERROR';
        this.lastError = error instanceof Error ? error.message : 'Local embedding inference failed';
        this.logger.error({ offset, error }, 'Local embedding batch failed');
      }
    }

    return results;
  }

  async prepare(): Promise<void> {
    this.modelPromise = null;
    this.state = 'DOWNLOADING';
    this.lastError = null;
    await this.getModel(true);
  }

  getStatus() {
    return {
      state: this.state,
      ready: this.state === 'READY',
      modelId: MODEL_ID,
      dimension: EMBEDDING_DIMENSION,
      lastError: this.lastError,
    };
  }

  private async getModel(allowRemote: boolean): Promise<FeatureExtractor> {
    if (!this.modelPromise) {
      this.state = allowRemote ? 'DOWNLOADING' : 'LOADING';
      this.modelPromise = this.loader(allowRemote)
        .then((extractor) => {
          this.state = 'READY';
          this.lastError = null;
          return extractor;
        })
        .catch((error: unknown) => {
          this.modelPromise = null;
          this.state = allowRemote ? 'ERROR' : 'UNAVAILABLE';
          this.lastError = error instanceof Error ? error.message : 'Model loading failed';
          throw error;
        });
    }
    return this.modelPromise;
  }

  private async loadTransformersModel(allowRemote: boolean): Promise<FeatureExtractor> {
    const { pipeline } = await import('@huggingface/transformers');
    const cacheDirectory = resolve(
      process.env.LOCAL_AI_MODEL_CACHE || 'var/models/embeddings',
    );
    const extractor = await pipeline(
      'feature-extraction',
      MODEL_ID,
      {
        cache_dir: cacheDirectory,
        local_files_only: !allowRemote,
        dtype: 'q8',
      },
    );
    return extractor as unknown as FeatureExtractor;
  }
}
