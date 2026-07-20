import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path';
import { Transform } from 'node:stream';
import { LocalStorageAdapter } from '../../../../infrastructure/storage/local-storage.adapter';

export interface HashedFile {
  byteSize: number;
  sha256: string;
}

export class BackupFilesystem {
  private readonly storage: LocalStorageAdapter;
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
    this.storage = new LocalStorageAdapter(this.rootPath);
  }

  validateManifestPaths(paths: readonly string[]): string[] {
    const uniquePaths = new Set<string>();
    return paths.map((candidate) => {
      if (!candidate || candidate.includes('\0') || win32.isAbsolute(candidate)) {
        throw new Error('Manifest entry must be a relative path');
      }
      if (candidate.split(/[\\/]/).some((part) => part === '..')) {
        throw new Error('Manifest entry must be a relative path');
      }
      if (candidate.includes('\\')) throw new Error('Manifest paths must use POSIX separators');
      if (posix.isAbsolute(candidate)) {
        throw new Error('Manifest entry must be a relative path');
      }
      const normalized = posix.normalize(candidate);
      if (normalized === '.' || normalized !== candidate) {
        throw new Error('Manifest entry must be a canonical relative path');
      }
      if (uniquePaths.has(normalized)) throw new Error(`Duplicate manifest path: ${normalized}`);
      uniquePaths.add(normalized);
      return normalized;
    });
  }

  async hashFile(relativePath: string): Promise<HashedFile> {
    const [safePath] = this.validateManifestPaths([relativePath]);
    const content = await this.storage.openReadStream(safePath);
    const sha256 = createHash('sha256');
    let byteSize = 0;
    for await (const chunk of content) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sha256.update(bytes);
      byteSize += bytes.length;
    }
    return { byteSize, sha256: sha256.digest('hex') };
  }

  async copyFileWithHash(sourcePath: string, destinationPath: string): Promise<HashedFile> {
    const [safeSource, safeDestination] = this.validateManifestPaths([
      sourcePath,
      destinationPath,
    ]);
    const sha256 = createHash('sha256');
    let byteSize = 0;
    const hasher = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sha256.update(chunk);
        byteSize += chunk.length;
        callback(null, chunk);
      },
    });
    const source = await this.storage.openReadStream(safeSource);
    source.on('error', (error) => hasher.destroy(error));
    source.pipe(hasher);
    await this.storage.writeStream({
      key: safeDestination,
      content: hasher,
      mimeType: 'application/octet-stream',
    });
    return { byteSize, sha256: sha256.digest('hex') };
  }

  async copyTree(sourcePrefix: string, destinationPrefix: string): Promise<void> {
    const [safeSource, safeDestination] = this.validateManifestPaths([
      sourcePrefix,
      destinationPrefix,
    ]);
    const entries = await this.listFiles(safeSource);
    await this.createDirectory(safeDestination);
    for (const entry of entries) {
      const suffix = entry.key.slice(safeSource.length).replace(/^\//, '');
      await this.copyFileWithHash(entry.key, `${safeDestination}/${suffix}`);
    }
  }

  async atomicRename(sourcePath: string, destinationPath: string): Promise<void> {
    const [safeSource, safeDestination] = this.validateManifestPaths([
      sourcePath,
      destinationPath,
    ]);
    await this.storage.rename(safeSource, safeDestination);
  }

  async createDirectory(relativePath: string): Promise<void> {
    const destination = await this.resolvePath(relativePath, false);
    await mkdir(destination, { recursive: true });
  }

  async absolutePath(relativePath: string, mustExist = false): Promise<string> {
    return this.resolvePath(relativePath, mustExist);
  }

  async listFiles(prefix: string): Promise<Array<{ key: string; byteSize: number; kind: 'FILE' }>> {
    try {
      const entries = await this.storage.walk(prefix);
      return entries
        .filter((entry): entry is typeof entry & { kind: 'FILE' } => entry.kind === 'FILE')
        .map(({ key, byteSize, kind }) => ({ key, byteSize, kind }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async writeJsonAtomic(
    relativePath: string,
    value: unknown,
  ): Promise<HashedFile> {
    const destination = await this.resolvePath(relativePath, false);
    const parentDirectory = dirname(destination);
    await mkdir(parentDirectory, { recursive: true });
    const temporary = `${destination}.tmp`;
    const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    try {
      const handle = await open(temporary, 'wx');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, destination);
      try {
        const directoryHandle = await open(parentDirectory, 'r');
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      } catch (error) {
        if (!['EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          throw error;
        }
      }
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return { byteSize: content.byteLength, sha256: createHash('sha256').update(content).digest('hex') };
  }

  async readJson(relativePath: string): Promise<{ value: unknown; byteSize: number; sha256: string }> {
    const source = await this.resolvePath(relativePath, true);
    const content = await readFile(source);
    return {
      value: JSON.parse(content.toString('utf8')) as unknown,
      byteSize: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }

  async removeTree(relativePath: string): Promise<void> {
    const destination = await this.resolvePath(relativePath, false);
    await rm(destination, { recursive: true, force: true });
  }

  async filesystemStats(): Promise<{ availableBytes: bigint; totalBytes: bigint }> {
    return this.storage.statfs();
  }

  private async resolvePath(relativePath: string, mustExist: boolean): Promise<string> {
    const [safePath] = this.validateManifestPaths([relativePath]);
    await mkdir(this.rootPath, { recursive: true });
    const root = await realpath(this.rootPath);
    const candidate = resolve(root, ...safePath.split('/'));
    const relativePathFromRoot = relative(root, candidate);
    if (
      relativePathFromRoot === '..' ||
      relativePathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(relativePathFromRoot)
    ) {
      throw new Error('Backup path resolves outside storage root');
    }
    let current = root;
    for (const segment of relativePathFromRoot.split(sep).filter(Boolean)) {
      current = resolve(current, segment);
      try {
        const entry = await lstat(current);
        if (entry.isSymbolicLink()) throw new Error('Backup path contains a symlink');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw error;
      }
    }
    if (mustExist) {
      await lstat(candidate);
      const resolvedCandidate = await realpath(candidate);
      const resolvedRelative = relative(root, resolvedCandidate);
      if (resolvedRelative === '..' || resolvedRelative.startsWith(`..${sep}`)) {
        throw new Error('Backup path resolves outside storage root');
      }
    }
    return candidate;
  }
}
