import { EmbeddingService } from '../../../../src/modules/workbench/knowledge/application/embedding.service';
import { EmbeddingCache } from '../../../../src/modules/workbench/knowledge/domain/embedding-cache';

describe('EmbeddingService', () => {
  let cache: EmbeddingCache;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    cache = new EmbeddingCache();
    mockFetch = jest.fn();
  });

  function makeService(apiKey = 'test-key') {
    return new EmbeddingService(cache, apiKey, 'https://api.deepseek.com/v1', mockFetch);
  }

  it('returns cached embeddings for previously computed texts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: Array(1536).fill(0.1) }] }),
    });

    const service = makeService();
    const texts = ['hello world'];
    const first = await service.embed(texts);
    const second = await service.embed(texts);

    expect(first).toEqual(second);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('batches requests into groups of 20', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: Array(20).fill({ embedding: Array(1536).fill(0.1) }) }),
    });

    const service = makeService();
    const texts = Array.from({ length: 45 }, (_, i) => `text ${i}`);
    await service.embed(texts);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 with exponential backoff', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: Array(1536).fill(0.1) }] }),
      });

    const service = makeService();
    const result = await service.embed(['text']);
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it('returns null embeddings on persistent failure', async () => {
    mockFetch.mockRejectedValue(new Error('500 Internal Server Error'));

    const service = makeService();
    const result = await service.embed(['text']);
    expect(result[0]).toBeNull();
  }, 10000);

  it('caches embeddings by SHA-256 content hash', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: Array(1536).fill(0.2) }] }),
    });

    const service = makeService();
    const text = 'unique content';
    await service.embed([text]);
    const result = await service.embed([text]);

    expect(result.length).toBe(1);
    expect(result[0]).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
