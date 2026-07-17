import { Module } from '@nestjs/common';
import { QueueInfrastructureModule } from '../../../infrastructure/queue/queue.module';
import { QueueAdminController } from './interface/http/queue-admin.controller';

@Module({
  imports: [QueueInfrastructureModule],
  controllers: [QueueAdminController],
})
export class QueueAdminModule {}
