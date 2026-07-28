import {
  EmbeddingModelLoader,
  EmbeddingService,
} from '../../../../src/modules/workbench/knowledge/application/embedding.service';
import { EmbeddingCache } from '../../../../src/modules/workbench/knowledge/domain/embedding-cache';

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
    expect(loader).toHaveBeenCalledWith(false);
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
    const loader = jest.fn(async (allowRemote: boolean) => {
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

    expect(loader).toHaveBeenCalledWith(true);
    expect(service.getStatus()).toMatchObject({ state: 'READY', ready: true, dimension: 384 });
  });
});
