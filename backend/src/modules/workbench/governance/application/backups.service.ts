import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BackupKind, BackupStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { BackupFilesystem } from '../infrastructure/backup-filesystem';
import { ProcessRunner } from '../infrastructure/process-runner';
import { BackupManifest, BackupManifestEntry, parseBackupManifest } from './backup-manifest';
import { AuditLogService } from './audit-log.service';

export const GOVERNANCE_JOB_LOCK_KEY = 79_403_201;
export const GOVERNANCE_BACKUP_CONFIG = Symbol('GOVERNANCE_BACKUP_CONFIG');

export interface GovernanceBackupConfig {
  databaseUrl: string;
  appVersion: string;
}

export interface ScheduledBackupOptions {
  kind: BackupKind;
}

@Injectable()
export class BackupsService {
  private busy = false;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly filesystem: BackupFilesystem,
    private readonly runner: ProcessRunner,
    private readonly audit: AuditLogService,
    @Inject(GOVERNANCE_BACKUP_CONFIG) private readonly config: GovernanceBackupConfig,
  ) {}

  createManual() {
    return this.create(BackupKind.MANUAL);
  }

  createPreRestore() {
    return this.create(BackupKind.PRE_RESTORE);
  }

  createScheduled(scheduledLocalDate: Date, options?: ScheduledBackupOptions) {
    void options;
    return this.create(BackupKind.SCHEDULED, scheduledLocalDate);
  }

  async list(query: { page?: number; pageSize?: number } = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.backupRecord.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.backupRecord.count(),
    ]);
    return { data: data.map((record) => this.present(record)), meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const record = await this.requireRecord(id);
    return this.present(record);
  }

  async verify(id: string) {
    const record = await this.requireRecord(id);
    if (record.status !== BackupStatus.CREATED && record.status !== BackupStatus.VERIFIED) {
      throw this.verificationError();
    }
    try {
      await this.verifyRecord(record.relativeDirectory, record.manifestSha256);
      const updated = await this.prisma.backupRecord.update({
        where: { id },
        data: { status: BackupStatus.VERIFIED, verifiedAt: new Date(), failureCode: null, failureMessage: null },
      });
      await this.audit.record({
        action: 'BACKUP_VERIFY',
        entityType: 'backup',
        entityId: id,
        outcome: 'SUCCEEDED',
        changedFields: ['status', 'verifiedAt'],
        metadata: { status: BackupStatus.VERIFIED, sha256: updated.manifestSha256 ?? undefined },
      });
      return this.present(updated);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.manifestError();
    }
  }

  async remove(id: string): Promise<void> {
    const record = await this.requireRecord(id);
    if (
      record.kind === BackupKind.PRE_RESTORE ||
      (record.status === BackupStatus.RESTORING || record.status === BackupStatus.RESTORED)
    ) {
      throw new AppError({
        code: ErrorCodes.BACKUP_DELETE_FORBIDDEN,
        message: 'This protected backup cannot be deleted',
        statusCode: HttpStatus.CONFLICT,
      });
    }
    await this.filesystem.removeTree(record.relativeDirectory);
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          action: 'BACKUP_DELETE',
          entityType: 'backup',
          entityId: id,
          outcome: 'SUCCEEDED',
          changedFields: [],
          metadata: { backupKind: record.kind, status: record.status },
        },
        tx,
      );
      await tx.backupRecord.delete({ where: { id } });
    });
  }

  async applyRetention(retentionDays: number, now = new Date()) {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const latest = await this.prisma.backupRecord.findFirst({
      where: { status: { in: [BackupStatus.CREATED, BackupStatus.VERIFIED] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const candidates = await this.prisma.backupRecord.findMany({
      where: {
        kind: { not: BackupKind.PRE_RESTORE },
        status: { in: [BackupStatus.CREATED, BackupStatus.VERIFIED] },
        createdAt: { lt: cutoff },
        id: latest ? { not: latest.id } : undefined,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    let deleted = 0;
    for (const record of candidates) {
      await this.filesystem.removeTree(record.relativeDirectory);
      await this.prisma.$transaction(async (tx) => {
        await this.audit.record(
          {
            action: 'BACKUP_RETENTION_DELETE',
            entityType: 'backup',
            entityId: record.id,
            outcome: 'SUCCEEDED',
            changedFields: [],
            metadata: { backupKind: record.kind, status: record.status },
          },
          tx,
        );
        await tx.backupRecord.delete({ where: { id: record.id } });
      });
      deleted += 1;
    }
    return { deleted };
  }

  scheduledAttemptCount(localDate: Date) {
    return this.prisma.auditLog.count({
      where: {
        action: 'BACKUP_CREATE',
        outcome: 'FAILED',
        metadata: {
          path: ['localDate'],
          equals: this.utcDateKey(localDate),
        },
      },
    });
  }

  private async create(kind: BackupKind, scheduledLocalDate?: Date) {
    if (this.busy) throw this.busyError();
    this.busy = true;
    let id: string = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let finalDirectory = `backups/${timestamp}-${id}`;
    let temporaryDirectory = `${finalDirectory}.tmp`;
    let recordCreated = false;
    let finalized = false;
    try {
      const scheduledRecord = scheduledLocalDate
        ? await this.prisma.backupRecord.findFirst({ where: { scheduledLocalDate } })
        : null;
      if (scheduledRecord) {
        if (
          scheduledRecord.status === BackupStatus.CREATED ||
          scheduledRecord.status === BackupStatus.VERIFIED
        ) {
          return this.present(scheduledRecord);
        }
        if (scheduledRecord.status !== BackupStatus.FAILED) throw this.busyError();
        id = scheduledRecord.id;
        finalDirectory = `backups/${timestamp}-${id}`;
        temporaryDirectory = `${finalDirectory}.tmp`;
        await this.prisma.backupRecord.update({
          where: { id },
          data: {
            status: BackupStatus.CREATING,
            relativeDirectory: finalDirectory,
            schemaVersion: 'pending',
            manifestSha256: null,
            databaseSha256: null,
            fileCount: 0,
            byteSize: 0,
            failureCode: null,
            failureMessage: null,
            verifiedAt: null,
          },
        });
      } else {
        await this.prisma.backupRecord.create({
          data: {
            id,
            kind,
            status: BackupStatus.CREATING,
            relativeDirectory: finalDirectory,
            scheduledLocalDate,
            schemaVersion: 'pending',
          },
        });
      }
      recordCreated = true;
      return await this.prisma.$transaction(
        async (tx) => {
          const lock = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
            'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
            GOVERNANCE_JOB_LOCK_KEY,
          );
          if (!lock[0]?.acquired) throw this.busyError();
          const schemaVersion = await this.migrationHead(tx);
          await this.filesystem.createDirectory(temporaryDirectory);
          const database = this.databaseConnection();
          await this.runner.run({
            executable: 'pg_dump',
            args: [
              '--format=custom',
              '--no-owner',
              '--no-privileges',
              '--schema=app',
              `--host=${database.hostname}`,
              `--port=${database.port}`,
              `--username=${database.username}`,
              `--dbname=${database.database}`,
              '--file=database.dump',
            ],
            cwd: await this.filesystem.absolutePath(temporaryDirectory),
            env: { ...process.env, PGPASSWORD: database.password },
          });
          const dump = await this.filesystem.hashFile(`${temporaryDirectory}/database.dump`);
          const sourceFiles = await this.filesystem.listFiles('files');
          const files: BackupManifestEntry[] = [];
          for (const source of sourceFiles) {
            const destination = `${temporaryDirectory}/${source.key}`;
            const copied = await this.filesystem.copyFileWithHash(source.key, destination);
            files.push({ path: source.key, ...copied });
          }
          const manifest: BackupManifest = {
            formatVersion: 1,
            appVersion: this.config.appVersion,
            schemaVersion,
            createdAt: new Date().toISOString(),
            database: { path: 'database.dump', ...dump },
            files,
          };
          const manifestFile = await this.filesystem.writeJsonAtomic(
            `${temporaryDirectory}/manifest.json`,
            manifest,
          );
          await this.verifyRecord(temporaryDirectory, manifestFile.sha256);
          await this.filesystem.atomicRename(temporaryDirectory, finalDirectory);
          finalized = true;
          const created = await tx.backupRecord.update({
            where: { id },
            data: {
              status: BackupStatus.CREATED,
              schemaVersion,
              manifestSha256: manifestFile.sha256,
              databaseSha256: dump.sha256,
              fileCount: files.length,
              byteSize: BigInt(dump.byteSize + files.reduce((sum, file) => sum + file.byteSize, 0)),
            },
          });
          await this.verifyRecord(finalDirectory, manifestFile.sha256);
          const verified = await tx.backupRecord.update({
            where: { id },
            data: { status: BackupStatus.VERIFIED, verifiedAt: new Date() },
          });
          await this.audit.record(
            {
              action: 'BACKUP_CREATE',
              entityType: 'backup',
              entityId: id,
              outcome: 'SUCCEEDED',
              changedFields: ['status'],
              metadata: {
                backupKind: kind,
                status: verified.status,
                fileCount: files.length,
                byteSize: Number(created.byteSize),
                sha256: manifestFile.sha256,
              },
            },
            tx,
          );
          return this.present(verified);
        },
        { timeout: 300_000 },
      );
    } catch (error) {
      await this.filesystem.removeTree(temporaryDirectory).catch(() => undefined);
      if (finalized) await this.filesystem.removeTree(finalDirectory).catch(() => undefined);
      if (recordCreated) {
        await this.prisma.backupRecord
          .update({
            where: { id },
            data: {
              status: BackupStatus.FAILED,
              failureCode: error instanceof AppError ? error.code : ErrorCodes.BACKUP_CREATE_FAILED,
              failureMessage: error instanceof AppError && error.code === ErrorCodes.BACKUP_BUSY
                ? 'Another backup or restore job is running'
                : 'Backup creation failed',
            },
          })
          .catch(() => undefined);
        await this.audit
          .record({
            action: 'BACKUP_CREATE',
            entityType: 'backup',
            entityId: id,
            outcome: 'FAILED',
            changedFields: ['status'],
            metadata: {
              backupKind: kind,
              status: BackupStatus.FAILED,
              errorCode: error instanceof AppError ? error.code : ErrorCodes.BACKUP_CREATE_FAILED,
              localDate: scheduledLocalDate ? this.utcDateKey(scheduledLocalDate) : undefined,
            },
          })
          .catch(() => undefined);
      }
      if (error instanceof AppError) throw error;
      throw new AppError({
        code: ErrorCodes.BACKUP_CREATE_FAILED,
        message: 'Backup creation failed',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        cause: error,
      });
    } finally {
      this.busy = false;
    }
  }

  private async verifyRecord(relativeDirectory: string, expectedManifestSha256: string | null) {
    const manifestFile = await this.filesystem.readJson(`${relativeDirectory}/manifest.json`);
    if (!expectedManifestSha256 || manifestFile.sha256 !== expectedManifestSha256) {
      throw this.manifestError();
    }
    let manifest: BackupManifest;
    try {
      manifest = parseBackupManifest(manifestFile.value);
      this.filesystem.validateManifestPaths([
        manifest.database.path,
        ...manifest.files.map((file) => file.path),
      ]);
      if (manifest.files.some((file) => !file.path.startsWith('files/'))) {
        throw new Error('Backup file entry must remain under files');
      }
    } catch (error) {
      throw this.manifestError(error);
    }
    for (const entry of [manifest.database, ...manifest.files]) {
      const actual = await this.filesystem.hashFile(`${relativeDirectory}/${entry.path}`);
      if (actual.byteSize !== entry.byteSize || actual.sha256 !== entry.sha256) {
        throw this.verificationError();
      }
    }
    return manifest;
  }

  private async migrationHead(client: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>) {
    const rows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT migration_name FROM app._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1',
    );
    return rows[0]?.migration_name ?? 'baseline';
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

  private async requireRecord(id: string) {
    const record = await this.prisma.backupRecord.findUnique({ where: { id } });
    if (!record) {
      throw new AppError({
        code: ErrorCodes.BACKUP_NOT_FOUND,
        message: 'Backup was not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    return record;
  }

  private present<T extends { byteSize: bigint }>(record: T) {
    return { ...record, byteSize: Number(record.byteSize) };
  }

  private busyError() {
    return new AppError({
      code: ErrorCodes.BACKUP_BUSY,
      message: 'Another backup or restore job is running',
      statusCode: HttpStatus.CONFLICT,
    });
  }

  private manifestError(cause?: unknown) {
    return new AppError({
      code: ErrorCodes.BACKUP_MANIFEST_INVALID,
      message: 'Backup manifest is invalid',
      statusCode: HttpStatus.CONFLICT,
      cause,
    });
  }

  private verificationError() {
    return new AppError({
      code: ErrorCodes.BACKUP_VERIFICATION_FAILED,
      message: 'Backup verification failed',
      statusCode: HttpStatus.CONFLICT,
    });
  }

  private utcDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
