import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupFilesystem } from '../../../../src/modules/workbench/governance/infrastructure/backup-filesystem';

describe('BackupFilesystem', () => {
  let root: string;
  let filesystem: BackupFilesystem;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'governance-backup-fs-'));
    filesystem = new BackupFilesystem(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    '/etc/passwd',
    '../outside.txt',
    'files/../../outside.txt',
    'C:\\Windows\\system.ini',
    '\\\\server\\share\\file.txt',
    '..\\outside.txt',
  ])('rejects POSIX and Windows path escape %s', (candidate) => {
    expect(() => filesystem.validateManifestPaths([candidate])).toThrow(/relative path/i);
  });

  it('rejects duplicate and non-POSIX manifest paths', () => {
    expect(() => filesystem.validateManifestPaths(['files/a.txt', 'files/a.txt'])).toThrow(
      /duplicate/i,
    );
    expect(() => filesystem.validateManifestPaths(['files\\a.txt'])).toThrow(/posix/i);
  });

  it('rejects reading through a symlink inside the storage root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'governance-backup-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(outside, join(root, 'linked-storage'));

    await expect(filesystem.hashFile('linked-storage/secret.txt')).rejects.toThrow(/symlink/i);
    await rm(outside, { recursive: true, force: true });
  });

  it('copies and hashes file content through streams', async () => {
    const content = Buffer.alloc(256 * 1024, 'a');
    await writeFile(join(root, 'source.bin'), content);

    const copied = await filesystem.copyFileWithHash(
      'source.bin',
      'backups/job-1/files/source.bin',
    );

    expect(copied).toEqual({
      byteSize: content.length,
      sha256: 'dd3dde87623d9a6b354c68c943d189c89c63652d945e7bbdf0986cae91a49521',
    });
    await expect(readFile(join(root, 'backups/job-1/files/source.bin'))).resolves.toEqual(content);
  });

  it('renames a completed staging directory atomically', async () => {
    await writeFile(join(root, 'staging.txt'), 'ready');

    await filesystem.atomicRename('staging.txt', 'manifest.json');

    await expect(readFile(join(root, 'manifest.json'), 'utf8')).resolves.toBe('ready');
    await expect(readFile(join(root, 'staging.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
