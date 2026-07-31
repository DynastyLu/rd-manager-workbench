import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppEnv } from './infrastructure/config/env.schema';
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

  const environment = app.get(ConfigService<AppEnv, true>);
  configureBodyParser(app);
  app.use(cookieParser());
  app.use(helmet());
  configureLocalCors(
    app,
    environment
      .get('AUTH_ALLOWED_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
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
