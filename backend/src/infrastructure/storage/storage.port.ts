export interface StorageWriteInput {
  key: string;
  content: Buffer;
  mimeType: string;
}

export interface StorageReadOutput {
  content: Buffer;
  mimeType: string;
}

export abstract class StoragePort {
  abstract checkHealth(): Promise<void>;
  abstract write(input: StorageWriteInput): Promise<{ storageKey: string; size: number }>;
  abstract read(storageKey: string): Promise<StorageReadOutput>;
  abstract delete(storageKey: string): Promise<void>;
}
