import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { StoragePort, StorageReadOutput, StorageWriteInput } from './storage.port';

@Injectable()
export class LocalStorageAdapter extends StoragePort {
  private readonly rootPath: string;
  private readonly mimeTypes = new Map<string, string>();

  constructor(@Optional() @Inject('LOCAL_STORAGE_ROOT') rootPath?: string) {
    super();
    this.rootPath = resolve(rootPath || process.env.LOCAL_STORAGE_ROOT || 'var/storage');
  }

  async write(input: StorageWriteInput): Promise<{ storageKey: string; size: number }> {
    const filePath = this.resolveStoragePath(input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content);
    this.mimeTypes.set(input.key, input.mimeType);

    return {
      storageKey: input.key,
      size: input.content.length,
    };
  }

  async read(storageKey: string): Promise<StorageReadOutput> {
    const filePath = this.resolveStoragePath(storageKey);
    return {
      content: await readFile(filePath),
      mimeType: this.mimeTypes.get(storageKey) || 'application/octet-stream',
    };
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.resolveStoragePath(storageKey);
    await rm(filePath, { force: true });
    this.mimeTypes.delete(storageKey);
  }

  private resolveStoragePath(storageKey: string): string {
    const filePath = resolve(this.rootPath, storageKey);
    if (filePath !== this.rootPath && !filePath.startsWith(`${this.rootPath}/`)) {
      throw new Error('Storage key resolves outside storage root');
    }

    return filePath;
  }
}
