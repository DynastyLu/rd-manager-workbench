import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FolderWatchService } from '../../../../src/modules/workbench/knowledge/application/folder-watch.service';

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

  it('replays the current progress snapshot to a subscriber that connects after scanning started', () => {
    const service = new FolderWatchService(
      {} as never,
      {} as never,
      {} as never,
    );
    const received: unknown[] = [];

    const subscription = service.getProgressStream('watch-1').subscribe((progress) => {
      received.push(progress);
    });

    expect(received).toEqual([
      expect.objectContaining({
        watchId: 'watch-1',
        phase: 'done',
        percent: 100,
      }),
    ]);
    subscription.unsubscribe();
  });
});
