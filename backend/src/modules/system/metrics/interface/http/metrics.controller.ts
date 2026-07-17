import { Controller, Get } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../../infrastructure/prisma/platform-prisma.service';

@Controller('system/metrics')
export class MetricsController {
  constructor(private readonly prisma: PlatformPrismaService) {}

  @Get()
  async get() {
    return {
      service: process.env.SERVICE_NAME || 'backend-core-platform',
      instanceId: process.env.INSTANCE_ID || process.env.HOSTNAME || 'local-instance',
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      jobs: {
        total: await this.countJobs(),
      },
    };
  }

  private async countJobs() {
    if (!process.env.DATABASE_URL?.trim()) {
      return 0;
    }

    try {
      return await this.prisma.job.count();
    } catch {
      return 0;
    }
  }
}
