import { S3StorageAdapter } from '../../../../src/infrastructure/storage/s3-storage.adapter';

describe('S3StorageAdapter', () => {
  it('writes, reads, and deletes objects through an S3-compatible client', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => Uint8Array.from(Buffer.from('hello')),
        },
        ContentType: 'text/plain',
      })
      .mockResolvedValueOnce({});
    const adapter = new S3StorageAdapter(
      {
        endpoint: 'http://127.0.0.1:9000',
        region: 'us-east-1',
        bucket: 'backend-core-platform',
        accessKeyId: 'minio',
        secretAccessKey: 'minio-secret',
        forcePathStyle: true,
      },
      { send } as never,
    );

    const saved = await adapter.write({
      key: 'jobs/job-1/result.txt',
      content: Buffer.from('hello'),
      mimeType: 'text/plain',
    });
    const read = await adapter.read(saved.storageKey);
    await adapter.delete(saved.storageKey);

    expect(saved).toEqual({ storageKey: 'jobs/job-1/result.txt', size: 5 });
    expect(read.content.toString()).toBe('hello');
    expect(read.mimeType).toBe('text/plain');
    expect(send).toHaveBeenCalledTimes(3);
  });
});
