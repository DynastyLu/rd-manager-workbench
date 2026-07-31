import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/app-config.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RequestContextModule } from './infrastructure/context/request-context.module';
import { AppLoggerService } from './infrastructure/logger/app-logger.service';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { HealthModule } from './modules/system/health/health.module';
import { QueueInfrastructureModule } from './infrastructure/queue/queue.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { WorkbenchModule } from './modules/workbench/workbench.module';
import { IamModule } from './modules/iam/iam.module';

@Module({
  imports: [
    AppConfigModule,
    RequestContextModule,
    PrismaModule,
    HealthModule,
    QueueInfrastructureModule,
    StorageModule,
    IamModule,
    WorkbenchModule,
  ],
  providers: [AppLoggerService, HttpExceptionFilter, ResponseInterceptor],
})
export class AppModule {}
