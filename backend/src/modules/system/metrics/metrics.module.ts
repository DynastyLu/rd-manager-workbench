import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { MetricsController } from './interface/http/metrics.controller';

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
