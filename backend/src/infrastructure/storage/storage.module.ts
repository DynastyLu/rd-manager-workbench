import { Module } from '@nestjs/common';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { StoragePort } from './storage.port';

@Module({
  providers: [
    LocalStorageAdapter,
    {
      provide: StoragePort,
      useFactory: (localStorageAdapter: LocalStorageAdapter) => {
        if (process.env.STORAGE_DRIVER === 's3') {
          return new S3StorageAdapter();
        }

        return localStorageAdapter;
      },
      inject: [LocalStorageAdapter],
    },
  ],
  exports: [StoragePort],
})
export class StorageModule {}
