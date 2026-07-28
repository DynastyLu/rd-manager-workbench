import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('FolderWatchService source contract', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'src/modules/workbench/knowledge/application/folder-watch.service.ts',
    ),
    'utf8',
  );

  it('uses asynchronous filesystem APIs and serializes work per watched folder', () => {
    expect(source).not.toMatch(/\breadFileSync\b|\breaddirSync\b|\bstatSync\b/);
    expect(source).toContain('runSerialized');
    expect(source).toContain('scanLocks');
  });

  it('marks imported documents as local file knowledge sources with processing metadata', () => {
    expect(source).toContain('KnowledgeSourceKind.LOCAL_FILE');
    expect(source).toContain('sourceSha256');
    expect(source).toContain('sourceModifiedAt');
    expect(source).toContain('indexStatus');
  });
});
