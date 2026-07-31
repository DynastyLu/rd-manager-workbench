import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const METADATA_LENGTH_BYTES = 4;
const PERSISTENCE_WARNING =
  '模型本次可用，但未能持久化到本机；重启后可能需要重新下载。';

export interface CachePersistenceStatus {
  state: 'UNKNOWN' | 'PERSISTED' | 'DEGRADED';
  durable: boolean | null;
  message: string | null;
}

interface CacheMetadata {
  version: 1;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  size: number;
}

interface FilesystemResponseCacheOptions {
  maxEntryBytes?: number;
}

type CacheRequest = string | URL | Request;

export class FilesystemResponseCache {
  private readonly maxEntryBytes: number;
  private persistenceStatus: CachePersistenceStatus = {
    state: 'UNKNOWN',
    durable: null,
    message: null,
  };

  constructor(
    private readonly directory: string,
    options: FilesystemResponseCacheOptions = {},
  ) {
    this.maxEntryBytes = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  }

  async match(request: CacheRequest): Promise<Response | undefined> {
    const entry = this.pathFor(request);
    try {
      const serialized = await readFile(entry);
      if (serialized.byteLength < METADATA_LENGTH_BYTES) throw new Error('Invalid cache entry');
      const metadataLength = serialized.readUInt32BE(0);
      if (
        metadataLength < 1
        || metadataLength > MAX_METADATA_BYTES
        || METADATA_LENGTH_BYTES + metadataLength > serialized.byteLength
      ) {
        throw new Error('Invalid cache metadata length');
      }
      const metadata = this.parseMetadata(
        serialized
          .subarray(METADATA_LENGTH_BYTES, METADATA_LENGTH_BYTES + metadataLength)
          .toString('utf8'),
      );
      if (!metadata || metadata.size > this.maxEntryBytes) {
        await this.removeEntry(entry);
        return undefined;
      }
      const body = serialized.subarray(METADATA_LENGTH_BYTES + metadataLength);
      if (body.byteLength !== metadata.size) {
        await this.removeEntry(entry);
        return undefined;
      }
      return new Response(body, {
        status: metadata.status,
        statusText: metadata.statusText,
        headers: metadata.headers,
      });
    } catch {
      await this.removeEntry(entry);
      return undefined;
    }
  }

  async put(request: CacheRequest, response: Response): Promise<void> {
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > this.maxEntryBytes) return;

    const entry = this.pathFor(request);
    const temporarySuffix = `${process.pid}-${randomUUID()}.tmp`;
    const temporaryEntry = `${entry}.${temporarySuffix}`;
    try {
      const body = Buffer.from(await response.clone().arrayBuffer());
      if (body.byteLength > this.maxEntryBytes) return;

      const headers: Array<[string, string]> = [];
      response.headers.forEach((value, name) => headers.push([name, value]));
      const metadata: CacheMetadata = {
        version: 1,
        status: response.status,
        statusText: response.statusText,
        headers,
        size: body.byteLength,
      };
      const serializedMetadata = Buffer.from(JSON.stringify(metadata), 'utf8');
      if (serializedMetadata.byteLength > MAX_METADATA_BYTES) return;
      const metadataLength = Buffer.allocUnsafe(METADATA_LENGTH_BYTES);
      metadataLength.writeUInt32BE(serializedMetadata.byteLength);

      await mkdir(this.directory, { recursive: true });
      await writeFile(
        temporaryEntry,
        Buffer.concat([metadataLength, serializedMetadata, body]),
      );
      await rename(temporaryEntry, entry);
      this.markPersisted();
    } catch {
      this.markDegraded();
    } finally {
      await this.removeEntry(temporaryEntry);
    }
  }

  async verifyWritable(): Promise<CachePersistenceStatus> {
    const probe = join(
      this.directory,
      `.persistence-probe-${process.pid}-${randomUUID()}.tmp`,
    );
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(probe, 'ok', 'utf8');
      this.markPersisted();
    } catch {
      this.markDegraded();
    } finally {
      await this.removeEntry(probe);
    }
    return this.getPersistenceStatus();
  }

  getPersistenceStatus(): CachePersistenceStatus {
    return { ...this.persistenceStatus };
  }

  private pathFor(request: CacheRequest) {
    const key = request instanceof Request
      ? request.url
      : request instanceof URL
        ? request.toString()
        : request;
    const digest = createHash('sha256').update(key).digest('hex');
    return join(this.directory, `${digest}.cache`);
  }

  private parseMetadata(serialized: string): CacheMetadata | null {
    try {
      const value = JSON.parse(serialized) as Partial<CacheMetadata>;
      if (
        value.version !== 1
        || !Number.isInteger(value.status)
        || value.status! < 200
        || value.status! > 599
        || typeof value.statusText !== 'string'
        || !Number.isInteger(value.size)
        || value.size! < 0
        || !Array.isArray(value.headers)
        || value.headers.some(
          (header) =>
            !Array.isArray(header)
            || header.length !== 2
            || header.some((part) => typeof part !== 'string'),
        )
      ) {
        return null;
      }
      return value as CacheMetadata;
    } catch {
      return null;
    }
  }

  private async removeEntry(entry: string): Promise<void> {
    await rm(entry, { force: true }).catch(() => undefined);
  }

  private markPersisted(): void {
    this.persistenceStatus = {
      state: 'PERSISTED',
      durable: true,
      message: null,
    };
  }

  private markDegraded(): void {
    this.persistenceStatus = {
      state: 'DEGRADED',
      durable: false,
      message: PERSISTENCE_WARNING,
    };
  }
}
