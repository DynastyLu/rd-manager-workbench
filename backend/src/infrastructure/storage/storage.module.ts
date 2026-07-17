import { Module } from '@nestjs/common';
import { LocalStorageAdapter } from './local-storage.adapter';
import { StoragePort } from './storage.port';

@Module({
  providers: [
    LocalStorageAdapter,
    {
      provide: StoragePort,
      useFactory: (localStorageAdapter: LocalStorageAdapter) => localStorageAdapter,
      inject: [LocalStorageAdapter],
    },
  ],
  exports: [StoragePort],
})
export class StorageModule {}
