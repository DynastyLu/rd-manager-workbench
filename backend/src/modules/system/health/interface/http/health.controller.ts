import { Controller, Get } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../../infrastructure/storage/storage.port';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: process.env.SERVICE_NAME || 'rd-manager-workbench',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  live() {
    return {
      status: 'live',
      service: process.env.SERVICE_NAME || 'rd-manager-workbench',
      instanceId: process.env.INSTANCE_ID || process.env.HOSTNAME || 'local-instance',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  async ready() {
    const checks = {
      database: await this.checkDatabase(),
      queue: 'unavailable',
      storage: await this.checkStorage(),
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

  private async checkStorage() {
    try {
      await this.storage.checkHealth();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
