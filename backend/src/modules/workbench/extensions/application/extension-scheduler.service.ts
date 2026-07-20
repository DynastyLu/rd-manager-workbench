import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { SmsDeliveryService } from './sms-delivery.service';

const SCAN_INTERVAL_MS = 30_000;

@Injectable()
export class ExtensionSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ExtensionSchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly sms: SmsDeliveryService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    void this.scanDue().catch((error: unknown) => this.logFailure(error));
    this.timer = setInterval(() => {
      void this.scanDue().catch((error: unknown) => this.logFailure(error));
    }, SCAN_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  scanDue(now = new Date()) {
    return this.sms.dispatchDue(now);
  }

  private logFailure(error: unknown) {
    this.logger.error('Extension scheduler scan failed', error instanceof Error ? error.stack : error);
  }
}
