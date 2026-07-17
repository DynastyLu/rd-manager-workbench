import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { parseEnvironment } from './infrastructure/config/env.schema'
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
    PrismaModule,
    HealthModule,
  ],
  providers: [HttpExceptionFilter, ResponseInterceptor],
})
export class AppModule {}
