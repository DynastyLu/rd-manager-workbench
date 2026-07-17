import { Test } from '@nestjs/testing';
import { StorageModule } from '../../../../src/infrastructure/storage/storage.module';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';

describe('StorageModule', () => {
  it('provides a local storage port without an external storage service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();

    expect(moduleRef.get(StoragePort)).toBeDefined();
    await moduleRef.close();
  });
});
