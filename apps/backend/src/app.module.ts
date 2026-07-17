import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { parseEnvironment } from './infrastructure/config/env.schema'
import { RequestContextMiddleware } from './infrastructure/context/request-context.middleware'
import { RequestContextModule } from './infrastructure/context/request-context.module'
import { LoggerModule } from './infrastructure/logger/logger.module'
import { PrismaModule } from './infrastructure/prisma/prisma.module'
import { HealthModule } from './modules/system/health/health.module'
import { HttpExceptionFilter } from './shared/filters/http-exception.filter'
import { ResponseInterceptor } from './shared/interceptors/response.interceptor'

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: parseEnvironment,
    }),
    RequestContextModule,
    LoggerModule,
    PrismaModule,
    HealthModule,
  ],
  providers: [HttpExceptionFilter, ResponseInterceptor],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*')
  }
}
