import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from '../../../common/interceptors/audit.interceptor';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { AuditLogService } from './application/audit-log.service';
import { BackupSchedulerService } from './application/backup-scheduler.service';
import {
  BackupsService,
  GOVERNANCE_BACKUP_CONFIG,
  GovernanceBackupConfig,
} from './application/backups.service';
import { DataHealthService } from './application/data-health.service';
import { GovernanceSettingsService } from './application/governance-settings.service';
import { RestorePreflightService } from './application/restore-preflight.service';
import { BackupFilesystem } from './infrastructure/backup-filesystem';
import { ProcessRunner } from './infrastructure/process-runner';
import { RestoreEngine } from './infrastructure/restore-engine';
import { RestoreJournal } from './infrastructure/restore-journal';
import { AuditLogsController } from './interface/http/audit-logs.controller';
import { BackupsController } from './interface/http/backups.controller';
import { DataHealthController } from './interface/http/data-health.controller';
import { GovernanceSettingsController } from './interface/http/governance-settings.controller';

@Module({
  imports: [StorageModule],
  controllers: [
    BackupsController,
    GovernanceSettingsController,
    AuditLogsController,
    DataHealthController,
  ],
  providers: [
    AuditLogService,
    BackupsService,
    GovernanceSettingsService,
    BackupSchedulerService,
    DataHealthService,
    RestorePreflightService,
    RestoreEngine,
    {
      provide: BackupFilesystem,
      useFactory: () => new BackupFilesystem(process.env.LOCAL_STORAGE_ROOT || 'var/storage'),
    },
    {
      provide: ProcessRunner,
      useFactory: () =>
        new ProcessRunner({
          allowedExecutables: ['pg_dump', 'pg_restore'],
          defaultTimeoutMs: Number(process.env.BACKUP_PROCESS_TIMEOUT_MS || 300_000),
        }),
    },
    {
      provide: RestoreJournal,
      useFactory: (filesystem: BackupFilesystem) => new RestoreJournal(filesystem),
      inject: [BackupFilesystem],
    },
    {
      provide: GOVERNANCE_BACKUP_CONFIG,
      useFactory: (): GovernanceBackupConfig => ({
        databaseUrl: process.env.DATABASE_URL || '',
        appVersion: process.env.npm_package_version || '0.1.0',
      }),
    },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [
    AuditLogService,
    BackupsService,
    GovernanceSettingsService,
    BackupSchedulerService,
    RestorePreflightService,
    RestoreEngine,
  ],
})
export class GovernanceModule {}
