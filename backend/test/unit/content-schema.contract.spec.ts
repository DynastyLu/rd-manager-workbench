import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260719020000_content_documents_files/migration.sql',
);

describe('content, knowledge and file Prisma contract', () => {
  const schema = readFileSync(schemaPath, 'utf8');

  it('defines the unified content and file models', () => {
    for (const model of [
      'KnowledgeSpace',
      'ContentDocument',
      'DocumentVersion',
      'FileAsset',
      'FileVersion',
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
    expect(schema).toContain('enum ContentDocumentType {');
    expect(schema).toContain('enum ContentStatus {');
    expect(schema).toContain('enum FileAssetStatus {');
  });

  it('keeps one meeting minutes document and project content relations', () => {
    expect(schema).toMatch(
      /model Meeting \{[\s\S]*?minutesDocumentId\s+String\?\s+@unique\s+@map\("minutes_document_id"\)/,
    );
    expect(schema).toMatch(/model Project \{[\s\S]*?contentDocuments\s+ContentDocument\[\]/);
    expect(schema).toMatch(/model Project \{[\s\S]*?fileAssets\s+FileAsset\[\]/);
  });

  it('ships a forward-only migration with query indexes and constraints', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');
    for (const table of [
      'knowledge_spaces',
      'content_documents',
      'document_versions',
      'file_assets',
      'file_versions',
    ]) {
      expect(migration).toContain(`CREATE TABLE "app"."${table}"`);
    }
    expect(migration).toContain('content_documents_parent_not_self_check');
    expect(migration).toContain('content_documents_unique_meeting_minutes_idx');
    expect(migration).toContain('file_versions_size_nonnegative_check');
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\s+TABLE\b/i);
  });
});
