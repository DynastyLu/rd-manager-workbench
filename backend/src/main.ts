import 'reflect-metadata';

import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { AppLoggerService } from './infrastructure/logger/app-logger.service';
import { configureBodyParser } from './bootstrap/body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.enableCors({
    credentials: true,
    origin: true,
  });
  configureBodyParser(app);
  app.useLogger(app.get(AppLoggerService));
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'sys/(.*)', method: RequestMethod.ALL },
      { path: 'label/(.*)', method: RequestMethod.ALL },
      { path: 'labelCategory/(.*)', method: RequestMethod.ALL },
      { path: 'audit/(.*)', method: RequestMethod.ALL },
      { path: 'authority/(.*)', method: RequestMethod.ALL },
      { path: 'dataResource/(.*)', method: RequestMethod.ALL },
      { path: 'open/(.*)', method: RequestMethod.ALL },
      { path: ':appId/sys/(.*)', method: RequestMethod.ALL },
      { path: ':basePath/:appId/sys/(.*)', method: RequestMethod.ALL },
    ],
  });
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
    .setTitle('Backend Core Platform')
    .setDescription('SaaS admin platform backend scaffold')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
}

void bootstrap();
