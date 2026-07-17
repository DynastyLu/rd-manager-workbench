import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { StoragePort, StorageReadOutput, StorageWriteInput } from './storage.port';

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

@Injectable()
export class S3StorageAdapter extends StoragePort implements OnModuleDestroy {
  private readonly client: Pick<S3Client, 'send'> & Partial<Pick<S3Client, 'destroy'>>;

  constructor(
    private readonly config: S3StorageConfig = readS3ConfigFromEnv(),
    client?: Pick<S3Client, 'send'>,
  ) {
    super();
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials:
          config.accessKeyId && config.secretAccessKey
            ? {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
              }
            : undefined,
      });
  }

  async write(input: StorageWriteInput): Promise<{ storageKey: string; size: number }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.content,
        ContentType: input.mimeType,
      }),
    );

    return {
      storageKey: input.key,
      size: input.content.length,
    };
  }

  async read(storageKey: string): Promise<StorageReadOutput> {
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: storageKey,
      }),
    );
    const body = object.Body;
    if (!body || typeof body.transformToByteArray !== 'function') {
      throw new Error('S3 object body is not readable');
    }

    return {
      content: Buffer.from(await body.transformToByteArray()),
      mimeType: object.ContentType || 'application/octet-stream',
    };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: storageKey,
      }),
    );
  }

  onModuleDestroy() {
    this.client.destroy?.();
  }
}

function readS3ConfigFromEnv(): S3StorageConfig {
  if (!process.env.S3_BUCKET) {
    throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
  }

  return {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  };
}
