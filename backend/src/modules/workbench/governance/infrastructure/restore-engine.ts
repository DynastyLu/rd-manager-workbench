import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { BackupStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../application/audit-log.service';
import { parseBackupManifest } from '../application/backup-manifest';
import {
  BackupsService,
  GOVERNANCE_JOB_LOCK_KEY,
  GOVERNANCE_BACKUP_CONFIG,
  GovernanceBackupConfig,
} from '../application/backups.service';
import { RestorePreflightService } from '../application/restore-preflight.service';
import { BackupFilesystem } from './backup-filesystem';
import { ProcessRunner } from './process-runner';
import { RestoreJournal } from './restore-journal';

export const RESTORE_JOB_ID_FACTORY = Symbol('RESTORE_JOB_ID_FACTORY');

export interface RestoreInput {
  backupId: string;
  preflightId: string;
  confirmationToken: string;
  expectedHash: string;
}

interface RestorableBackup {
  id: string;
  relativeDirectory: string;
  schemaVersion: string;
  manifestSha256?: string | null;
}

@Injectable()
export class RestoreEngine {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly preflight: RestorePreflightService,
    private readonly backups: BackupsService,
    private readonly filesystem: BackupFilesystem,
    private readonly runner: ProcessRunner,
    private readonly journal: RestoreJournal,
    private readonly audit: AuditLogService,
    @Inject(GOVERNANCE_BACKUP_CONFIG) private readonly config: GovernanceBackupConfig,
    @Optional() @Inject(RESTORE_JOB_ID_FACTORY)
    private readonly jobIdFactory: () => string = randomUUID,
  ) {}

  async restore(input: RestoreInput): Promise<{ backupId: string; restored: true }> {
    const jobId = this.jobIdFactory();
    const stagingRoot = `restore-staging/${jobId}`;
    const originalFiles = `restore-journal/${jobId}/files-before`;
    let protective: RestorableBackup | undefined;
    let filesMoved = false;
    let target: RestorableBackup | undefined;

    try {
      const lock = await this.prisma.$queryRawUnsafe<Array<{ acquired: boolean }>>(
        'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
        GOVERNANCE_JOB_LOCK_KEY,
      );
      if (!lock[0]?.acquired) {
        throw new AppError({
          code: ErrorCodes.BACKUP_BUSY,
          message: 'Another backup or restore job is running',
          statusCode: HttpStatus.CONFLICT,
        });
      }

      protective = await this.backups.createPreRestore();
      target = await this.preflight.consume(input);
      await this.filesystem.createDirectory(stagingRoot);
      await this.filesystem.copyTree(`${target.relativeDirectory}/files`, `${stagingRoot}/files`);
      await this.journal.begin({
        jobId,
        targetBackupId: target.id,
        protectiveBackupId: protective.id,
      });

      await this.prisma.$disconnect();
      await this.runPgRestore(target.relativeDirectory);
      await this.journal.mark('DATABASE_RESTORED');

      await this.filesystem.createDirectory('files');
      await this.filesystem.atomicRename('files', originalFiles);
      filesMoved = true;
      await this.filesystem.atomicRename(`${stagingRoot}/files`, 'files');
      await this.journal.mark('FILES_SWAPPED');

      await this.prisma.$connect();
      await this.validateRestoredState(target);
      await this.journal.mark('VALIDATED');
      await this.prisma.backupRecord.update({
        where: { id: target.id },
        data: { status: BackupStatus.RESTORED, restoredAt: new Date() },
      });
      await this.audit.record({
        action: 'BACKUP_RESTORE',
        entityType: 'backup',
        entityId: target.id,
        outcome: 'SUCCEEDED',
        changedFields: ['status', 'restoredAt'],
        metadata: { status: BackupStatus.RESTORED, sha256: input.expectedHash },
      });
      await this.journal.complete();
      await this.filesystem.removeTree(originalFiles).catch(() => undefined);
      await this.filesystem.removeTree(stagingRoot).catch(() => undefined);
      return { backupId: target.id, restored: true };
    } catch (cause) {
      if (!protective || !target) {
        if (cause instanceof AppError) throw cause;
        throw this.restoreError(ErrorCodes.RESTORE_FAILED, cause);
      }
      try {
        await this.prisma.$disconnect().catch(() => undefined);
        await this.runPgRestore(protective.relativeDirectory);
        if (filesMoved) {
          await this.filesystem.removeTree('files');
          await this.filesystem.atomicRename(originalFiles, 'files');
        }
        await this.prisma.$connect();
        await this.validateRestoredState(protective);
        await this.journal.mark('ROLLED_BACK');
        await this.prisma.backupRecord.update({
          where: { id: protective.id },
          data: { status: BackupStatus.RESTORED, restoredAt: new Date() },
        }).catch(() => undefined);
        await this.audit.record({
          action: 'BACKUP_RESTORE',
          entityType: 'backup',
          entityId: input.backupId,
          outcome: 'FAILED',
          changedFields: [],
          metadata: { errorCode: ErrorCodes.RESTORE_FAILED, rollback: 'SUCCEEDED' },
        }).catch(() => undefined);
        throw this.restoreError(ErrorCodes.RESTORE_FAILED, cause);
      } catch (rollbackCause) {
        if (rollbackCause instanceof AppError && rollbackCause.code === ErrorCodes.RESTORE_FAILED) {
          throw rollbackCause;
        }
        await this.journal.mark('ROLLBACK_FAILED').catch(() => undefined);
        await this.audit.record({
          action: 'BACKUP_RESTORE',
          entityType: 'backup',
          entityId: input.backupId,
          outcome: 'FAILED',
          changedFields: [],
          metadata: { errorCode: ErrorCodes.RESTORE_ROLLBACK_FAILED, rollback: 'FAILED' },
        }).catch(() => undefined);
        throw this.restoreError(ErrorCodes.RESTORE_ROLLBACK_FAILED, rollbackCause);
      }
    }
  }

  private async runPgRestore(relativeDirectory: string) {
    const database = this.databaseConnection();
    await this.runner.run({
      executable: 'pg_restore',
      args: [
        '--single-transaction',
        '--exit-on-error',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        `--host=${database.hostname}`,
        `--port=${database.port}`,
        `--username=${database.username}`,
        `--dbname=${database.database}`,
        'database.dump',
      ],
      cwd: await this.filesystem.absolutePath(relativeDirectory, true),
      env: { ...process.env, PGPASSWORD: database.password },
    });
  }

  private async validateRestoredState(backup: RestorableBackup) {
    await this.prisma.$queryRawUnsafe('SELECT 1 AS result');
    const migrations = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT migration_name FROM app._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1',
    );
    if (migrations[0]?.migration_name !== backup.schemaVersion) {
      throw new Error('Restored migration fingerprint does not match');
    }
    const foreignKeys = await this.prisma.$queryRawUnsafe<Array<{ invalid_count: number | bigint }>>(
      "SELECT count(*)::int AS invalid_count FROM pg_constraint WHERE contype = 'f' AND NOT convalidated",
    );
    if (Number(foreignKeys[0]?.invalid_count ?? 0) > 0) {
      throw new Error('Restored database contains unvalidated foreign keys');
    }
    await this.prisma.$queryRawUnsafe(
      'SELECT (SELECT count(*) FROM app.projects) AS projects, (SELECT count(*) FROM app.work_tasks) AS tasks, (SELECT count(*) FROM app.file_assets) AS files',
    );
    const manifestFile = await this.filesystem.readJson(`${backup.relativeDirectory}/manifest.json`);
    if (backup.manifestSha256 && manifestFile.sha256 !== backup.manifestSha256) {
      throw new Error('Restored backup manifest changed');
    }
    const manifest = parseBackupManifest(manifestFile.value);
    if (manifest.schemaVersion !== backup.schemaVersion) {
      throw new Error('Restored manifest schema does not match');
    }
    for (const entry of manifest.files) {
      const actual = await this.filesystem.hashFile(entry.path);
      if (actual.byteSize !== entry.byteSize || actual.sha256 !== entry.sha256) {
        throw new Error('Restored file hash does not match');
      }
    }
  }

  private databaseConnection() {
    const url = new URL(this.config.databaseUrl);
    return {
      hostname: url.hostname,
      port: url.port || '5432',
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  }

  private restoreError(code: typeof ErrorCodes.RESTORE_FAILED | typeof ErrorCodes.RESTORE_ROLLBACK_FAILED, cause: unknown) {
    return new AppError({
      code,
      message: code === ErrorCodes.RESTORE_ROLLBACK_FAILED
        ? 'Restore and automatic rollback failed; recovery evidence was preserved'
        : 'Restore failed and the previous state was restored',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      cause,
    });
  }
}
