import { KnowledgeController } from '../../../../src/modules/workbench/knowledge/interface/http/knowledge.controller';

describe('KnowledgeController embedding lifecycle', () => {
  function createController(
    embeddings: {
      prepare: jest.Mock;
      getStatus: jest.Mock;
    },
    indexing: {
      indexAll: jest.Mock;
      getStatus?: jest.Mock;
    },
  ) {
    return new KnowledgeController(
      {} as never,
      {} as never,
      indexing as never,
      {} as never,
      {} as never,
      embeddings as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('automatically starts reindexing after the local model becomes ready', async () => {
    const embeddings = {
      prepare: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        state: 'READY',
        ready: true,
        modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        dimension: 384,
        runtime: 'wasm',
        lastError: null,
      }),
    };
    const indexing = {
      indexAll: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
    };
    const controller = createController(embeddings, indexing);

    await expect(controller.prepareEmbeddingModel()).resolves.toMatchObject({
      state: 'READY',
      ready: true,
      reindexJobId: 'job-1',
    });
    expect(indexing.indexAll).toHaveBeenCalledTimes(1);
  });

  it('includes the current reindex lifecycle in ready embedding status', async () => {
    const embeddings = {
      prepare: jest.fn(),
      getStatus: jest.fn().mockReturnValue({
        state: 'READY',
        ready: true,
        modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        dimension: 384,
        runtime: 'native',
        lastError: null,
      }),
    };
    const indexing = {
      indexAll: jest.fn(),
      getStatus: jest.fn().mockResolvedValue({
        indexedDocuments: 3,
        totalDocuments: 10,
        totalChunks: 24,
        complete: false,
        latestJob: {
          id: 'job-1',
          status: 'RUNNING',
          processedFiles: 3,
          totalFiles: 10,
        },
      }),
    };
    const controller = createController(embeddings, indexing);

    await expect(controller.getEmbeddingStatus()).resolves.toMatchObject({
      state: 'READY',
      reindex: {
        complete: false,
        latestJob: {
          status: 'RUNNING',
          processedFiles: 3,
          totalFiles: 10,
        },
      },
    });
  });

  it('does not start reindexing when model preparation remains unavailable', async () => {
    const embeddings = {
      prepare: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        state: 'ERROR',
        ready: false,
        modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        dimension: 384,
        runtime: null,
        lastError: '本地语义模型加载失败，请重试。',
      }),
    };
    const indexing = {
      indexAll: jest.fn(),
    };
    const controller = createController(embeddings, indexing);

    await expect(controller.prepareEmbeddingModel()).resolves.toMatchObject({
      state: 'ERROR',
      ready: false,
    });
    expect(indexing.indexAll).not.toHaveBeenCalled();
  });
});
