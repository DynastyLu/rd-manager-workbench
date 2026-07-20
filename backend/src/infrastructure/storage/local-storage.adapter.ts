import { constants, createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  StorageEntryStat,
  StorageFilesystemStats,
  StoragePort,
  StorageReadOutput,
  StorageStreamWriteInput,
  StorageWriteInput,
} from './storage.port';

@Injectable()
export class LocalStorageAdapter extends StoragePort {
  private readonly rootPath: string;
  private readonly mimeTypes = new Map<string, string>();

  constructor(@Optional() @Inject('LOCAL_STORAGE_ROOT') rootPath?: string) {
    super();
    this.rootPath = resolve(rootPath || process.env.LOCAL_STORAGE_ROOT || 'var/storage');
  }

  async checkHealth(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true });
    await access(this.rootPath, constants.R_OK | constants.W_OK | constants.X_OK);
  }

  async write(input: StorageWriteInput): Promise<{ storageKey: string; size: number }> {
    const filePath = await this.resolveStoragePath(input.key, false);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content);
    this.mimeTypes.set(input.key, input.mimeType);

    return {
      storageKey: input.key,
      size: input.content.length,
    };
  }

  async writeStream(
    input: StorageStreamWriteInput,
  ): Promise<{ storageKey: string; size: number }> {
    const filePath = await this.resolveStoragePath(input.key, false);
    await mkdir(dirname(filePath), { recursive: true });
    await this.assertExistingSegmentsAreSafe(filePath);
    const temporaryPath = `${filePath}.tmp-${randomUUID()}`;

    try {
      await pipeline(input.content, createWriteStream(temporaryPath, { flags: 'wx' }));
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }

    const written = await stat(filePath);
    this.mimeTypes.set(input.key, input.mimeType);
    return { storageKey: input.key, size: written.size };
  }

  async read(storageKey: string): Promise<StorageReadOutput> {
    const filePath = await this.resolveStoragePath(storageKey, true);
    return {
      content: await readFile(filePath),
      mimeType: this.mimeTypes.get(storageKey) || 'application/octet-stream',
    };
  }

  async openReadStream(storageKey: string): Promise<Readable> {
    const filePath = await this.resolveStoragePath(storageKey, true);
    return createReadStream(filePath);
  }

  async stat(storageKey: string): Promise<StorageEntryStat> {
    const safeKey = this.normalizeStorageKey(storageKey, false);
    const filePath = await this.resolveStoragePath(safeKey, true);
    const entry = await stat(filePath);
    return {
      key: safeKey,
      byteSize: entry.size,
      modifiedAt: entry.mtime,
      kind: entry.isDirectory() ? 'DIRECTORY' : 'FILE',
    };
  }

  async walk(prefix = ''): Promise<StorageEntryStat[]> {
    const safePrefix = this.normalizeStorageKey(prefix, true);
    const startPath = await this.resolveStoragePath(safePrefix, true, true);
    const result: StorageEntryStat[] = [];

    const visit = async (directoryPath: string, directoryKey: string): Promise<void> => {
      const children = await readdir(directoryPath, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        const childPath = resolve(directoryPath, child.name);
        const childKey = directoryKey ? posix.join(directoryKey, child.name) : child.name;
        const entry = await lstat(childPath);
        if (entry.isSymbolicLink()) throw new Error(`Storage path contains a symlink: ${childKey}`);
        await this.assertRealPathContained(childPath);
        result.push({
          key: childKey,
          byteSize: entry.size,
          modifiedAt: entry.mtime,
          kind: entry.isDirectory() ? 'DIRECTORY' : 'FILE',
        });
        if (entry.isDirectory()) await visit(childPath, childKey);
      }
    };

    const start = await lstat(startPath);
    if (start.isSymbolicLink()) throw new Error('Storage prefix cannot be a symlink');
    if (start.isDirectory()) await visit(startPath, safePrefix);
    else result.push(await this.stat(safePrefix));
    return result;
  }

  async statfs(): Promise<StorageFilesystemStats> {
    const root = await this.ensureRoot();
    const filesystem = await statfs(root, { bigint: true });
    return {
      availableBytes: filesystem.bavail * filesystem.bsize,
      totalBytes: filesystem.blocks * filesystem.bsize,
    };
  }

  async rename(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = await this.resolveStoragePath(sourceKey, true);
    const destinationPath = await this.resolveStoragePath(destinationKey, false);
    await mkdir(dirname(destinationPath), { recursive: true });
    await this.assertExistingSegmentsAreSafe(destinationPath);
    await rename(sourcePath, destinationPath);

    const mimeType = this.mimeTypes.get(sourceKey);
    if (mimeType) this.mimeTypes.set(destinationKey, mimeType);
    this.mimeTypes.delete(sourceKey);
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = await this.resolveStoragePath(storageKey, false);
    await rm(filePath, { force: true });
    this.mimeTypes.delete(storageKey);
  }

  private async ensureRoot(): Promise<string> {
    await mkdir(this.rootPath, { recursive: true });
    return realpath(this.rootPath);
  }

  private normalizeStorageKey(storageKey: string, allowRoot: boolean): string {
    if (storageKey.includes('\0')) throw new Error('Storage key must be a relative path');
    if (storageKey.includes('\\')) throw new Error('Storage key must use POSIX separators');
    if (isAbsolute(storageKey) || win32.isAbsolute(storageKey)) {
      throw new Error('Storage key must be a relative path');
    }
    const segments = storageKey.split('/');
    if (segments.some((segment) => segment === '..')) {
      throw new Error('Storage key must be a relative path');
    }
    const normalized = posix.normalize(storageKey);
    if (normalized === '.' && allowRoot) return '';
    if (!normalized || normalized === '.' || normalized.startsWith('../')) {
      throw new Error('Storage key must be a relative path');
    }
    return normalized;
  }

  private async resolveStoragePath(
    storageKey: string,
    mustExist: boolean,
    allowRoot = false,
  ): Promise<string> {
    const normalized = this.normalizeStorageKey(storageKey, allowRoot);
    const root = await this.ensureRoot();
    const filePath = normalized ? resolve(root, ...normalized.split('/')) : root;
    this.assertLexicallyContained(root, filePath);
    await this.assertExistingSegmentsAreSafe(filePath);
    if (mustExist) {
      await lstat(filePath);
      await this.assertRealPathContained(filePath, root);
    }
    return filePath;
  }

  private assertLexicallyContained(root: string, candidate: string): void {
    const relativePath = relative(root, candidate);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error('Storage key resolves outside storage root');
    }
  }

  private async assertExistingSegmentsAreSafe(candidate: string): Promise<void> {
    const root = await this.ensureRoot();
    this.assertLexicallyContained(root, candidate);
    const relativePath = relative(root, candidate);
    let current = root;
    for (const segment of relativePath.split(sep).filter(Boolean)) {
      current = resolve(current, segment);
      try {
        const entry = await lstat(current);
        if (entry.isSymbolicLink()) {
          throw new Error(`Storage path contains a symlink: ${segment}`);
        }
        await this.assertRealPathContained(current, root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
    }
  }

  private async assertRealPathContained(candidate: string, knownRoot?: string): Promise<void> {
    const root = knownRoot ?? (await this.ensureRoot());
    const resolvedCandidate = await realpath(candidate);
    this.assertLexicallyContained(root, resolvedCandidate);
  }
}
