import { ChunkingService } from '../../../../src/modules/workbench/knowledge/application/chunking.service';

describe('ChunkingService', () => {
  const service = new ChunkingService();

  it('splits a document shorter than chunk size into one chunk', () => {
    const text = '短文档。'.repeat(20);
    const chunks = service.chunk(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  it('splits a long document at paragraph boundaries with overlap', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `这是第${i + 1}段内容。`.repeat(60),
    );
    const text = paragraphs.join('\n\n');
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeGreaterThan(0);
    });
  });

  it('splits at heading boundaries when available', () => {
    const text = [
      '# 第一章',
      '内容A'.repeat(200),
      '## 第一节',
      '内容B'.repeat(200),
      '# 第二章',
      '内容C'.repeat(200),
    ].join('\n\n');
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    chunks.forEach((chunk) => {
      expect(chunk.metadata).toHaveProperty('headingPath');
    });
  });

  it('estimates token count for mixed Chinese/English text', () => {
    const text = '中文内容 '.repeat(100) + 'English text '.repeat(50);
    const chunks = service.chunk(text);
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    expect(totalTokens).toBeGreaterThan(200);
    expect(totalTokens).toBeLessThan(2000);
  });
});
