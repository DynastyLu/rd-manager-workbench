import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingCache } from '../domain/embedding-cache';

const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const EMBEDDING_DIM = 1536;

interface DeepSeekEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly cache: EmbeddingCache,
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.deepseek.com/v1',
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async embed(texts: string[]): Promise<(number[] | null)[]> {
    const results: (number[] | null)[] = new Array(texts.length);

    const uncached: Array<{ text: string; index: number }> = [];
    texts.forEach((text, i) => {
      const cached = this.cache.get(text);
      if (cached) {
        results[i] = cached;
      } else {
        uncached.push({ text, index: i });
      }
    });

    if (uncached.length === 0) return results;

    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const batchTexts = batch.map((b) => b.text);

      try {
        const embeddings = await this.fetchEmbeddings(batchTexts);
        embeddings.forEach((emb, j) => {
          const { index, text } = batch[j];
          results[index] = emb;
          if (emb) this.cache.set(text, emb);
        });
      } catch (error) {
        this.logger.error({ batchIndex: i, error }, 'Embedding batch failed');
        batch.forEach(({ index }) => {
          results[index] = null;
        });
      }
    }

    return results;
  }

  private async fetchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model: 'deepseek-v4-pro', input: texts }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          throw new Error(`DeepSeek Embeddings API returned ${response.status}`);
        }

        const body = (await response.json()) as DeepSeekEmbeddingResponse;
        return body.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding.slice(0, EMBEDDING_DIM));
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError;
  }
}
