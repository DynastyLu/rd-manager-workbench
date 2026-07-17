import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../infrastructure/config/app-config.module';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { QueueInfrastructureModule } from '../../infrastructure/queue/queue.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { JobsModule } from '../../modules/system/jobs/jobs.module';
import { OcrProcessor } from './ocr.processor';
import { BaiduOcrService } from './services/baidu-ocr.service';
import { CopyrightRiskService } from './services/copyright-risk.service';
import { ExcelExportService } from './services/excel-export.service';
import { HairstyleTransformService } from './services/hairstyle-transform.service';

@Module({
  imports: [AppConfigModule, QueueInfrastructureModule, StorageModule, JobsModule],
  providers: [
    AppLoggerService,
    BaiduOcrService,
    CopyrightRiskService,
    ExcelExportService,
    HairstyleTransformService,
    OcrProcessor,
  ],
})
export class OcrWorkerModule {}
