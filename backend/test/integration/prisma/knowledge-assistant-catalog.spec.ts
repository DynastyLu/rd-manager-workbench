import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function modelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing ${modelName} model`);
  return match[1];
}

describe('knowledge assistant workspace catalog', () => {
  const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');
  const migrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260728100000_ai_assistant_workspace/migration.sql',
  );

  it('persists session scope, pinning, archive state, and reply links', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const session = modelBlock(schema, 'KnowledgeSession');
    const message = modelBlock(schema, 'KnowledgeMessage');

    expect(schema).toMatch(/enum KnowledgeScopeType/);
    expect(session).toMatch(/scopeType\s+KnowledgeScopeType/);
    expect(session).toMatch(/scopeValue\s+Json\?/);
    expect(session).toMatch(/isPinned\s+Boolean/);
    expect(session).toMatch(/archivedAt\s+DateTime\?/);
    expect(message).toMatch(/replyToMessageId\s+String\?/);
    expect(session).toContain('@@index([archivedAt, isPinned, updatedAt])');
  });

  it('ships an additive session migration', () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('CREATE TYPE "app"."KnowledgeScopeType"');
    expect(migration).toContain('"scope_type"');
    expect(migration).toContain('"reply_to_message_id"');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });
});
