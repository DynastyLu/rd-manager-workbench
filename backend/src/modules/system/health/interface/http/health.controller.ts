import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PlatformPrismaService } from '../../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../../infrastructure/storage/storage.port';
import { QueueNames } from '../../../../../shared/contracts/jobs/queue-names';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
    @Optional() @InjectQueue(QueueNames.Ocr) private readonly queue?: Queue,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: process.env.SERVICE_NAME || 'backend-core-platform',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  live() {
    return {
      status: 'live',
      service: process.env.SERVICE_NAME || 'backend-core-platform',
      instanceId: process.env.INSTANCE_ID || process.env.HOSTNAME || 'local-instance',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  async ready() {
    const checks = {
      database: await this.checkDatabase(),
      queue: await this.checkQueue(),
      storage: this.checkStorage(),
    };
    const status = Object.values(checks).every((value) => value === 'ok' || value === 'unavailable')
      ? 'ready'
      : 'not_ready';

    return {
      status,
      checks,
    };
  }

  private async checkDatabase() {
    if (!process.env.DATABASE_URL?.trim()) {
      return 'unavailable';
    }

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkQueue() {
    if (!this.queue) {
      return 'unavailable';
    }

    try {
      await this.queue.getJobCounts('waiting', 'active', 'completed', 'failed');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private checkStorage() {
    return this.storage ? 'ok' : 'error';
  }
}
