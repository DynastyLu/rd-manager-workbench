import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/app-config.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RequestContextModule } from './infrastructure/context/request-context.module';
import { AppLoggerService } from './infrastructure/logger/app-logger.service';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { TenantModule } from './modules/platform/tenant/tenant.module';
import { UserModule } from './modules/iam/user/user.module';
import { RoleModule } from './modules/iam/role/role.module';
import { AuditModule } from './modules/system/audit/audit.module';
import { HealthModule } from './modules/system/health/health.module';
import { AiAssistantMockModule } from './modules/system/ai-assistant-mock/ai-assistant-mock.module';
import { QueueInfrastructureModule } from './infrastructure/queue/queue.module';
import { JobsModule } from './modules/system/jobs/jobs.module';
import { MetricsModule } from './modules/system/metrics/metrics.module';
import { QueueAdminModule } from './modules/system/queue-admin/queue-admin.module';
import { CopyrightToolsModule } from './modules/tools/copyright/copyright-tools.module';
import { OcrToolsModule } from './modules/tools/ocr/ocr-tools.module';
import { HairstyleToolsModule } from './modules/tools/hairstyle/hairstyle-tools.module';
import { PaperAuthModule } from './modules/tools/paper-auth/paper-auth.module';
import { TagManagementMockModule } from './modules/tag-management-mock/tag-management-mock.module';

@Module({
  imports: [
    AppConfigModule,
    RequestContextModule,
    PrismaModule,
    TenantModule,
    UserModule,
    RoleModule,
    AuditModule,
    HealthModule,
    MetricsModule,
    QueueAdminModule,
    AiAssistantMockModule,
    QueueInfrastructureModule,
    JobsModule,
    PaperAuthModule,
    OcrToolsModule,
    HairstyleToolsModule,
    CopyrightToolsModule,
    TagManagementMockModule,
  ],
  providers: [AppLoggerService, HttpExceptionFilter, ResponseInterceptor],
})
export class AppModule {}
