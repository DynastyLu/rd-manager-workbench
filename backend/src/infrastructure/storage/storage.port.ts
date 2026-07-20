import { Readable } from 'node:stream';

export interface StorageWriteInput {
  key: string;
  content: Buffer;
  mimeType: string;
}

export interface StorageStreamWriteInput {
  key: string;
  content: Readable;
  mimeType: string;
}

export interface StorageReadOutput {
  content: Buffer;
  mimeType: string;
}

export interface StorageEntryStat {
  key: string;
  byteSize: number;
  modifiedAt: Date;
  kind: 'FILE' | 'DIRECTORY';
}

export interface StorageFilesystemStats {
  availableBytes: bigint;
  totalBytes: bigint;
}

export abstract class StoragePort {
  abstract checkHealth(): Promise<void>;
  abstract write(input: StorageWriteInput): Promise<{ storageKey: string; size: number }>;
  abstract writeStream(
    input: StorageStreamWriteInput,
  ): Promise<{ storageKey: string; size: number }>;
  abstract read(storageKey: string): Promise<StorageReadOutput>;
  abstract openReadStream(storageKey: string): Promise<Readable>;
  abstract stat(storageKey: string): Promise<StorageEntryStat>;
  abstract walk(prefix?: string): Promise<StorageEntryStat[]>;
  abstract statfs(): Promise<StorageFilesystemStats>;
  abstract rename(sourceKey: string, destinationKey: string): Promise<void>;
  abstract delete(storageKey: string): Promise<void>;
}
