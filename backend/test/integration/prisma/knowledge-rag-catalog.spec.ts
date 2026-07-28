import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const extensionsMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260726100321_knowledge_extensions/migration.sql',
  ),
  'utf8',
);

describe('knowledge RAG Prisma catalog', () => {
  it('installs vector and trigram extensions before creating knowledge tables', () => {
    expect(extensionsMigration).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(extensionsMigration).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  });

  it('declares DocumentChunk, KnowledgeSession, KnowledgeMessage, and AiUsageLog contracts', () => {
    expect(schema).toMatch(/model DocumentChunk/);
    expect(schema).toMatch(/embedding\s+Unsupported/);
    expect(schema).toMatch(/model KnowledgeSession/);
    expect(schema).toMatch(/enum KnowledgeSessionStatus/);
    expect(schema).toMatch(/model KnowledgeMessage/);
    expect(schema).toMatch(/enum MessageRole/);
    expect(schema).toMatch(/model AiUsageLog/);
  });

  it('tracks file sources, processing states, extraction locations, and durable index jobs', () => {
    expect(schema).toMatch(/enum KnowledgeSourceKind/);
    expect(schema).toMatch(/enum KnowledgeProcessingStatus/);
    expect(schema).toMatch(/enum KnowledgeIndexJobStatus/);
    expect(schema).toMatch(/model KnowledgeIndexJob/);
    expect(schema).toMatch(/sourceKind\s+KnowledgeSourceKind/);
    expect(schema).toMatch(/previewStatus\s+KnowledgeProcessingStatus/);
    expect(schema).toMatch(/indexStatus\s+KnowledgeProcessingStatus/);
    expect(schema).toMatch(/embedding\s+Unsupported\("public\.vector\(384\)"\)/);
    expect(schema).toMatch(/pageNumber\s+Int\?/);
    expect(schema).toMatch(/sheetName\s+String\?/);
    expect(schema).toMatch(/locationLabel\s+String\?/);
  });
});
