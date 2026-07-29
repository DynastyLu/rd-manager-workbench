import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FolderWatchService } from '../../../../src/modules/workbench/knowledge/application/folder-watch.service';

describe('FolderWatchService', () => {
  function createService() {
    const prisma = {
      folderWatch: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new FolderWatchService(prisma as never, {} as never, {} as never);
    return { prisma, service };
  }

  it('reactivates a paused folder and starts its rescan without holding the HTTP request open', async () => {
    const { prisma, service } = createService();
    prisma.folderWatch.findUniqueOrThrow.mockResolvedValue({
      id: 'watch-1',
      folderPath: '/knowledge',
      recursive: true,
      status: 'PAUSED',
    });
    const neverFinishes = new Promise<never>(() => undefined);
    const fullScan = jest.spyOn(
      service as unknown as { fullScan: (id: string) => Promise<unknown> },
      'fullScan',
    );
    fullScan.mockReturnValue(neverFinishes);
    const startWatcher = jest.spyOn(
      service as unknown as {
        startWatcher: (id: string, folderPath: string, recursive: boolean) => void;
      },
      'startWatcher',
    );
    startWatcher.mockImplementation(() => undefined);

    await expect(service.rescan('watch-1')).resolves.toEqual({ started: true });

    expect(prisma.folderWatch.update).toHaveBeenCalledWith({
      where: { id: 'watch-1' },
      data: { status: 'ACTIVE', errorMessage: null },
    });
    expect(startWatcher).toHaveBeenCalledWith('watch-1', '/knowledge', true);
    expect(fullScan).toHaveBeenCalledWith('watch-1');
    expect(service.getProgress('watch-1')).toEqual(
      expect.objectContaining({
        phase: 'scanning',
        current: 0,
        scanned: 0,
        percent: 0,
      }),
    );
  });

  it('reports each supported file while walking a folder', async () => {
    const { service } = createService();
    const root = await mkdtemp(join(tmpdir(), 'folder-watch-progress-'));
    const nested = join(root, 'nested');
    await mkdir(nested);
    await Promise.all([
      writeFile(join(root, 'one.md'), '# one'),
      writeFile(join(nested, 'two.txt'), 'two'),
      writeFile(join(root, 'ignored.png'), 'not supported'),
    ]);
    const onScanned = jest.fn();

    try {
      const files = await (
        service as unknown as {
          scanFolder: (
            folderPath: string,
            recursive: boolean,
            onFile: (fileName: string, scanned: number) => void,
          ) => Promise<Array<{ fileName: string }>>;
        }
      ).scanFolder(root, true, onScanned);

      expect(files.map((file) => file.fileName).sort()).toEqual(['one.md', 'two.txt']);
      expect(onScanned).toHaveBeenCalledTimes(2);
      expect(onScanned.mock.calls.map((call) => call[1])).toEqual([1, 2]);
      expect(onScanned.mock.calls.map((call) => call[0]).sort()).toEqual(['one.md', 'two.txt']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
