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

  it('preserves spreadsheet sheet names and source locations in chunk metadata', () => {
    const text = [
      '=== 研发部 ===',
      '姓名,本周完成,下周计划',
      '张三,完成知识库改造,补充回归测试',
      '',
      '=== 产品部 ===',
      '姓名,本周完成,下周计划',
      '李四,完成需求评审,跟进交互验收',
    ].join('\n');

    const chunks = service.chunk(text, { chunkSize: 20, chunkOverlap: 0 });

    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          sheetName: '研发部',
          locationLabel: expect.stringContaining('研发部'),
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          sheetName: '产品部',
          locationLabel: expect.stringContaining('产品部'),
        }),
      }),
    ]));
  });
});
