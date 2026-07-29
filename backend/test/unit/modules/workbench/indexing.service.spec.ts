import { IndexingService } from '../../../../src/modules/workbench/knowledge/application/indexing.service';

describe('IndexingService', () => {
  let mockPrisma: any; let mockChunking: any; let mockEmbeddings: any; let service: IndexingService;

  beforeEach(() => {
    mockChunking = { chunk: jest.fn() };
    const tx = {
      documentChunk: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    mockPrisma = {
      documentChunk: tx.documentChunk,
      contentDocument: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      knowledgeIndexJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
      $executeRawUnsafe: tx.$executeRawUnsafe,
      $queryRawUnsafe: tx.$queryRawUnsafe,
    };
    mockEmbeddings = {
      embed: jest.fn().mockResolvedValue([
        Array(384).fill(0.1),
        Array(384).fill(0.2),
      ]),
    };
    service = new IndexingService(mockPrisma, mockChunking, mockEmbeddings);
  });

  it('chunks and writes local 384-dimensional embeddings with document chunks', async () => {
    mockChunking.chunk.mockReturnValue([
      { chunkIndex: 0, content: 'c1', tokenCount: 5, metadata: {} },
      { chunkIndex: 1, content: 'c2', tokenCount: 5, metadata: {} },
    ]);
    mockPrisma.contentDocument.findUnique.mockResolvedValue({ plainText: 'text' });

    const result = await service.indexDocument('doc1', 'text');
    expect(mockEmbeddings.embed).toHaveBeenCalledWith(['c1', 'c2']);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(mockPrisma.$executeRawUnsafe.mock.calls[0][6]).toContain('0.1');
    expect(result).toEqual({ chunks: 2, embedded: 2 });
  });

  it('reports indexing status', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ count: 5n }]);
    mockPrisma.contentDocument.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(8);

    const status = await service.getStatus();
    expect(status.indexedDocuments).toBe(0);
    expect(status.totalDocuments).toBe(8);
    expect(status.totalChunks).toBe(5);
    expect(status.complete).toBe(false);
  });

  it('marks automatically scheduled documents searchable after writing chunks', async () => {
    mockChunking.chunk.mockReturnValue([
      { chunkIndex: 0, content: '可搜索内容', tokenCount: 5, metadata: {} },
    ]);
    mockEmbeddings.embed.mockResolvedValue([null]);
    mockPrisma.contentDocument.findUnique.mockResolvedValue({ plainText: '可搜索内容' });

    (service as any).pending.add('doc1');
    await (service as any).flush();

    expect(mockPrisma.contentDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc1' },
      data: {
        indexStatus: 'PARTIAL',
        indexedAt: expect.any(Date),
      },
    });
  });

  it('marks automatically scheduled documents failed when indexing throws', async () => {
    mockPrisma.contentDocument.findUnique.mockRejectedValue(new Error('broken file'));

    (service as any).pending.add('doc1');
    await (service as any).flush();

    expect(mockPrisma.contentDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc1' },
      data: { indexStatus: 'FAILED' },
    });
  });

  it('persists reindex jobs so progress survives beyond an HTTP request', async () => {
    mockPrisma.contentDocument.findMany.mockResolvedValue([]);

    await expect(service.indexAll()).resolves.toEqual({ jobId: 'job-1' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockPrisma.knowledgeIndexJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'QUEUED', totalFiles: 0 }),
      select: { id: true },
    });
    expect(mockPrisma.knowledgeIndexJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'SUCCEEDED' }),
    });
  });

  it('repairs legacy pending states when searchable chunks already exist', async () => {
    await service.onModuleInit();

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("SET index_status = 'PARTIAL'"),
    );
  });
});
