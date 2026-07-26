import { RagService } from '../../../../src/modules/workbench/knowledge/application/rag.service';

describe('RagService', () => {
  let mockPrisma: any; let mockDeepseek: any; let service: RagService;

  beforeEach(() => {
    mockPrisma = { $queryRawUnsafe: jest.fn() } as any;
    mockDeepseek = { streamChat: jest.fn() } as any;
    service = new RagService(mockPrisma, mockDeepseek);
  });

  it('retrieves chunks, assembles prompt, returns stream', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'c1', document_id: 'doc1', chunk_index: 0, content: 'chunk content', metadata: {}, document_title: 'Test Doc', similarity: 0.92 },
    ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    const result = await service.ask({ question: 'test?', history: [] });
    // Should pass the question text directly for trigram similarity search
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('similarity'), 'test?', 20);
    expect(result.stream).toBeDefined();
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].title).toBe('Test Doc');
  });

  it('returns empty citations when no chunks above threshold', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    const result = await service.ask({ question: 'test?', history: [] });
    expect(result.citations).toHaveLength(0);
  });

  it('includes conversation history', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'c1', document_id: 'd1', chunk_index: 0, content: 'x', metadata: {}, document_title: 'T', similarity: 0.9 },
    ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    await service.ask({
      question: 'follow up?',
      history: [{ role: 'USER', content: 'q1' }, { role: 'ASSISTANT', content: 'a1' }],
    });

    const call = mockDeepseek.streamChat.mock.calls[0][0];
    expect(call.messages).toEqual(expect.arrayContaining([{ role: 'user', content: 'follow up?' }]));
    expect(call.systemPrompt).toContain('研发知识库助手');
  });
});
