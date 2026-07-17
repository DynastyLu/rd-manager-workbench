import { Module } from '@nestjs/common';
import { PolicyModule } from '../../iam/policy/policy.module';
import { ListAuditLogsUseCase } from './application/list-audit-logs.use-case';
import { RecordAuditLogUseCase } from './application/record-audit-log.use-case';
import { AUDIT_LOG_REPOSITORY } from './domain/audit-log.repository';
import { AuditController } from './interface/http/audit.controller';
import { InMemoryAuditLogRepository } from './infrastructure/in-memory-audit-log.repository';

@Module({
  imports: [PolicyModule],
  controllers: [AuditController],
  providers: [
    InMemoryAuditLogRepository,
    {
      provide: AUDIT_LOG_REPOSITORY,
      useExisting: InMemoryAuditLogRepository,
    },
    {
      provide: RecordAuditLogUseCase,
      useFactory: (auditLogRepository: InMemoryAuditLogRepository) =>
        new RecordAuditLogUseCase(auditLogRepository),
      inject: [InMemoryAuditLogRepository],
    },
    {
      provide: ListAuditLogsUseCase,
      useFactory: (auditLogRepository: InMemoryAuditLogRepository) =>
        new ListAuditLogsUseCase(auditLogRepository),
      inject: [InMemoryAuditLogRepository],
    },
  ],
  exports: [RecordAuditLogUseCase, ListAuditLogsUseCase],
})
export class AuditModule {}
