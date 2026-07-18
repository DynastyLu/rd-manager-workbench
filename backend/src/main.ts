import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { AppLoggerService } from './infrastructure/logger/app-logger.service';
import { configureBodyParser } from './bootstrap/body-parser';
import { configureLocalCors } from './bootstrap/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  configureBodyParser(app);
  configureLocalCors(app);
  app.useLogger(app.get(AppLoggerService));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(app.get(HttpExceptionFilter));
  app.useGlobalInterceptors(app.get(ResponseInterceptor));

  const config = new DocumentBuilder()
    .setTitle('RD Manager Workbench')
    .setDescription('Local single-user engineering manager workbench')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 4311);
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
}

void bootstrap();
