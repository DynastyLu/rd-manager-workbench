import { Module } from '@nestjs/common';
import { QueueInfrastructureModule } from '../../../infrastructure/queue/queue.module';
import { JobsModule } from '../../system/jobs/jobs.module';
import { OcrJobProducer } from '../ocr/application/ocr-job.producer';
import { CopyrightRiskController } from './interface/http/copyright-risk.controller';

@Module({
  imports: [JobsModule, QueueInfrastructureModule],
  controllers: [CopyrightRiskController],
  providers: [OcrJobProducer],
})
export class CopyrightToolsModule {}
