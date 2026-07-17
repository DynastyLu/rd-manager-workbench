import { Module } from '@nestjs/common';
import { QueueInfrastructureModule } from '../../../infrastructure/queue/queue.module';
import { JobsModule } from '../../system/jobs/jobs.module';
import { OcrJobProducer } from './application/ocr-job.producer';
import { LegacyOcrController } from './interface/http/legacy-ocr.controller';
import { OcrJobsController } from './interface/http/ocr-jobs.controller';

@Module({
  imports: [JobsModule, QueueInfrastructureModule],
  controllers: [OcrJobsController, LegacyOcrController],
  providers: [OcrJobProducer],
  exports: [OcrJobProducer],
})
export class OcrToolsModule {}
