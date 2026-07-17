import { Module } from '@nestjs/common';
import { JobsModule } from '../../system/jobs/jobs.module';
import { OcrToolsModule } from '../ocr/ocr-tools.module';
import { HairstyleJobsController } from './interface/http/hairstyle-jobs.controller';
import { HairstyleStylesController } from './interface/http/hairstyle-styles.controller';
import { HairstyleTransformService } from '../../../workers/ocr/services/hairstyle-transform.service';

@Module({
  imports: [JobsModule, OcrToolsModule],
  controllers: [HairstyleJobsController, HairstyleStylesController],
  providers: [HairstyleTransformService],
  exports: [HairstyleTransformService],
})
export class HairstyleToolsModule {}
