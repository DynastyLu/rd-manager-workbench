import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

describe('knowledge RAG Prisma catalog', () => {
  it('declares DocumentChunk, KnowledgeSession, KnowledgeMessage, and AiUsageLog contracts', () => {
    expect(schema).toMatch(/model DocumentChunk/);
    expect(schema).toMatch(/embedding\s+Unsupported/);
    expect(schema).toMatch(/model KnowledgeSession/);
    expect(schema).toMatch(/enum KnowledgeSessionStatus/);
    expect(schema).toMatch(/model KnowledgeMessage/);
    expect(schema).toMatch(/enum MessageRole/);
    expect(schema).toMatch(/model AiUsageLog/);
  });
});
