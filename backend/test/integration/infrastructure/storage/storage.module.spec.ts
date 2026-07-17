import { Test } from '@nestjs/testing';
import { StorageModule } from '../../../../src/infrastructure/storage/storage.module';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';

describe('StorageModule', () => {
  const originalStorageDriver = process.env.STORAGE_DRIVER;

  afterEach(() => {
    if (originalStorageDriver === undefined) {
      delete process.env.STORAGE_DRIVER;
    } else {
      process.env.STORAGE_DRIVER = originalStorageDriver;
    }
  });

  it('provides a storage port in local mode', async () => {
    process.env.STORAGE_DRIVER = 'local';

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();

    expect(moduleRef.get(StoragePort)).toBeDefined();
    await moduleRef.close();
  });

  it('provides a storage port in s3 mode', async () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9000';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_BUCKET = 'backend-core-platform';
    process.env.S3_ACCESS_KEY_ID = 'minio';
    process.env.S3_SECRET_ACCESS_KEY = 'minio-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();

    expect(moduleRef.get(StoragePort)).toBeDefined();
    await moduleRef.close();
  });
});
