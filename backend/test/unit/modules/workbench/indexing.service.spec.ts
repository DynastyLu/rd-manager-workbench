import { IndexingService } from '../../../../src/modules/workbench/knowledge/application/indexing.service';

describe('IndexingService', () => {
  let mockPrisma: any; let mockChunking: any; let mockEmbedding: any; let service: IndexingService;

  beforeEach(() => {
    mockChunking = { chunk: jest.fn() };
    mockEmbedding = { embed: jest.fn() };
    mockPrisma = {
      documentChunk: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      contentDocument: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
      $transaction: jest.fn((fn: Function) => fn(mockPrisma)),
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    service = new IndexingService(mockPrisma, mockChunking, mockEmbedding);
  });

  it('chunks, embeds, and writes document chunks', async () => {
    mockChunking.chunk.mockReturnValue([
      { chunkIndex: 0, content: 'c1', tokenCount: 5, metadata: {} },
      { chunkIndex: 1, content: 'c2', tokenCount: 5, metadata: {} },
    ]);
    mockEmbedding.embed.mockResolvedValue([Array(1536).fill(0.1), Array(1536).fill(0.2)]);
    mockPrisma.contentDocument.findUnique.mockResolvedValue({ plainText: 'text' });

    await service.indexDocument('doc1', 'text');
    expect(mockPrisma.documentChunk.deleteMany).toHaveBeenCalledWith({ where: { documentId: 'doc1' } });
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('reports indexing status', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ count: 5n }])
      .mockResolvedValueOnce([{ count: 0n }]);
    mockPrisma.contentDocument.count.mockResolvedValue(8);

    const status = await service.getStatus();
    expect(status.indexedDocuments).toBe(5);
    expect(status.totalDocuments).toBe(8);
    expect(status.complete).toBe(false);
  });
});
