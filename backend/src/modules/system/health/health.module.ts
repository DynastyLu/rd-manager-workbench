import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { HealthController } from './interface/http/health.controller';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
