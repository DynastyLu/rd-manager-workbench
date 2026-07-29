import { RagService } from '../../../../src/modules/workbench/knowledge/application/rag.service';

describe('RagService', () => {
  let mockPrisma: any; let mockDeepseek: any; let mockEmbeddings: any; let service: RagService;

  beforeEach(() => {
    mockPrisma = { $queryRaw: jest.fn() } as any;
    mockDeepseek = { streamChat: jest.fn() } as any;
    mockEmbeddings = { embed: jest.fn().mockResolvedValue([null]) } as any;
    service = new RagService(mockPrisma, mockDeepseek, mockEmbeddings);
  });

  it('combines local vector retrieval with full-text retrieval when the model is ready', async () => {
    mockEmbeddings.embed.mockResolvedValue([Array(384).fill(0.1)]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'c1', document_id: 'doc1', chunk_index: 0, content: '材料耐盐性能', metadata: {}, document_title: '材料方案', similarity: 0.86 },
      ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    const result = await service.ask({ question: '耐盐材料', history: [], scope: { type: 'ALL' } });

    expect(mockPrisma.$queryRaw.mock.calls.some((call: unknown[]) =>
      String((call[0] as { strings?: string[] }).strings?.join('')).includes('<=>'),
    )).toBe(true);
    expect(result.citations[0]).toMatchObject({ documentId: 'doc1', title: '材料方案' });
  });

  it('retrieves chunks, assembles prompt, returns stream', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 'c1', document_id: 'doc1', chunk_index: 0, content: 'chunk content', metadata: {}, document_title: 'Test Doc', similarity: 0.92 },
    ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    const result = await service.ask({ question: 'test?', history: [], scope: { type: 'ALL' } });
    const query = mockPrisma.$queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join('')).toContain('similarity');
    expect(query.values).toContain('test?');
    expect(result.stream).toBeDefined();
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].title).toBe('Test Doc');
  });

  it('searches partially indexed documents when text chunks are available', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await service.ask({ question: '总结周报', history: [], scope: { type: 'ALL' } });

    const queryText = mockPrisma.$queryRaw.mock.calls
      .map((call: unknown[]) => String((call[0] as { strings?: string[] }).strings?.join('')))
      .join('\n');
    expect(queryText).toContain("cd.index_status IN ('READY', 'PARTIAL')");
  });

  it('retrieves recent document chunks for summary requests', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValue([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'c1',
          document_id: 'doc1',
          chunk_index: 0,
          content: '本周完成项目评审并关闭两个风险。',
          metadata: {},
          document_title: '研发周报',
          space_name: null,
          similarity: 0.2,
          page_number: null,
          sheet_name: null,
          location_label: null,
        },
      ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    const result = await service.ask({
      question: '总结最近上传的研发资料',
      history: [],
      scope: { type: 'ALL' },
    });

    const summaryQuery = mockPrisma.$queryRaw.mock.calls[1][0] as { strings: string[] };
    expect(summaryQuery.strings.join('')).toContain('ORDER BY cd.updated_at DESC');
    expect(result.citations).toHaveLength(1);
    expect(mockDeepseek.streamChat).toHaveBeenCalled();
  });

  it('returns empty citations when no chunks above threshold', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await service.ask({ question: 'test?', history: [], scope: { type: 'ALL' } });
    expect(result.citations).toHaveLength(0);
    expect(result.hasEvidence).toBe(false);
    expect(result.stream).toBeNull();
    expect(mockDeepseek.streamChat).not.toHaveBeenCalled();
  });

  it('includes conversation history', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 'c1', document_id: 'd1', chunk_index: 0, content: 'x', metadata: {}, document_title: 'T', similarity: 0.9 },
    ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    await service.ask({
      question: 'follow up?',
      history: [{ role: 'USER', content: 'q1' }, { role: 'ASSISTANT', content: 'a1' }],
      scope: { type: 'ALL' },
    });

    const call = mockDeepseek.streamChat.mock.calls[0][0];
    expect(call.messages).toEqual(expect.arrayContaining([{ role: 'user', content: 'follow up?' }]));
    expect(call.systemPrompt).toContain('研发知识库助手');
  });
});
