import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from '../app.module'
import { HttpExceptionFilter } from '../shared/filters/http-exception.filter'
import { ResponseInterceptor } from '../shared/interceptors/response.interceptor'

export function configureBackendApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  app.useGlobalFilters(app.get(HttpExceptionFilter))
  app.useGlobalInterceptors(app.get(ResponseInterceptor))
  app.enableShutdownHooks()

  return app
}

export async function createBackendApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  return configureBackendApp(app)
}
