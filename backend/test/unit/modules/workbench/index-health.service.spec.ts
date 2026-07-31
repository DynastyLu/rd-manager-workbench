import { IndexHealthService } from '../../../../src/modules/workbench/knowledge/application/index-health.service';

describe('IndexHealthService', () => {
  const prisma = {
    contentDocument: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
  };
  const files = { getOriginal: jest.fn() };
  const importer = { extract: jest.fn() };
  const indexing = { indexDocument: jest.fn() };
  const audit = { record: jest.fn() };
  const requestContext = {
    requirePrincipal: jest.fn().mockReturnValue({ userId: 'user-1', roleCodes: [] }),
  };
  const dataScope = {
    documents: jest.fn().mockReturnValue({}),
  };
  let service: IndexHealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IndexHealthService(
      prisma as never,
      files as never,
      importer as never,
      indexing as never,
      audit as never,
      requestContext as never,
      dataScope as never,
    );
    prisma.$queryRawUnsafe.mockResolvedValue([{ documentId: 'embedding-missing' }]);
    prisma.contentDocument.findMany.mockResolvedValue([
      {
        id: 'extract-missing',
        title: '提取失败',
        originalName: 'extract.pdf',
        mimeType: 'application/pdf',
        sourceKind: 'UPLOAD',
        plainText: '',
        previewStatus: 'FAILED',
        indexStatus: 'FAILED',
        processingError: 'extract failed /Users/private/file.pdf',
        _count: { chunks: 0 },
      },
      {
        id: 'embedding-missing',
        title: '缺少向量',
        originalName: 'embedding.md',
        mimeType: 'text/markdown',
        sourceKind: 'UPLOAD',
        plainText: 'ready text',
        previewStatus: 'READY',
        indexStatus: 'PARTIAL',
        processingError: null,
        _count: { chunks: 2 },
      },
      {
        id: 'ignored',
        title: '已忽略',
        originalName: 'ignored.txt',
        mimeType: 'text/plain',
        sourceKind: 'UPLOAD',
        plainText: '',
        previewStatus: 'FAILED',
        indexStatus: 'MISSING',
        processingError: '[INDEX_HEALTH_IGNORED]',
        _count: { chunks: 0 },
      },
    ]);
  });

  it('groups unhealthy documents without exposing raw processing errors', async () => {
    const result = await service.list();

    expect(result.items).toEqual([
      expect.objectContaining({
        documentId: 'extract-missing',
        category: 'EXTRACTION_MISSING',
        reason: '文件内容尚未成功提取',
      }),
      expect.objectContaining({
        documentId: 'embedding-missing',
        category: 'EMBEDDINGS_MISSING',
        reason: '文本块尚未全部向量化',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('/Users/private');
    expect(result.excludedDocumentCount).toBe(3);
  });

  it('re-extracts and indexes one failed document and audits the repair action', async () => {
    prisma.contentDocument.findFirst.mockResolvedValue({
      id: 'extract-missing',
      title: '提取失败',
      originalName: 'extract.pdf',
      mimeType: 'application/pdf',
    });
    files.getOriginal.mockResolvedValue({
      content: Buffer.from('pdf'),
      fileName: 'extract.pdf',
      mimeType: 'application/pdf',
      sha256: 'hash',
    });
    importer.extract.mockResolvedValue({ title: '已修复', plainText: 'extracted', wordCount: 9 });
    indexing.indexDocument.mockResolvedValue({ chunks: 1, embedded: 1 });
    prisma.contentDocument.update.mockResolvedValue({});
    audit.record.mockResolvedValue({});

    await service.retryOne('extract-missing');

    expect(indexing.indexDocument).toHaveBeenCalledWith('extract-missing', 'extracted');
    expect(prisma.contentDocument.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'extract-missing' },
        data: expect.objectContaining({ indexStatus: 'READY', processingError: null }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KNOWLEDGE_INDEX_RETRY',
        entityId: 'extract-missing',
        outcome: 'SUCCEEDED',
      }),
    );
  });

  it('marks an ignored document as excluded and audits the action', async () => {
    prisma.contentDocument.findFirst.mockResolvedValue({ id: 'extract-missing' });
    prisma.contentDocument.update.mockResolvedValue({});
    audit.record.mockResolvedValue({});

    await service.ignore('extract-missing');

    expect(prisma.contentDocument.update).toHaveBeenCalledWith({
      where: { id: 'extract-missing' },
      data: {
        indexStatus: 'MISSING',
        processingError: '[INDEX_HEALTH_IGNORED]',
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KNOWLEDGE_INDEX_IGNORE',
        outcome: 'SUCCEEDED',
      }),
    );
  });
});
