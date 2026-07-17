import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppLoggerService } from '../infrastructure/logger/app-logger.service';
import { OcrWorkerModule } from './ocr/ocr-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(OcrWorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLoggerService));
}

void bootstrap();
