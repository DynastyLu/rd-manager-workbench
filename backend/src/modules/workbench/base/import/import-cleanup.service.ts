import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BaseImportService } from './base-import.service';

@Injectable()
export class ImportCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly imports: BaseImportService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.imports.cleanupExpired(), 60 * 60 * 1000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
