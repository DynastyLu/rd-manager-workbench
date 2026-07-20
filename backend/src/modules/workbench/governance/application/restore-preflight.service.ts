import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { BackupStatus, RestorePreflightStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { BackupFilesystem } from '../infrastructure/backup-filesystem';
import { ProcessRunner } from '../infrastructure/process-runner';
import { parseBackupManifest } from './backup-manifest';
import { AuditLogService } from './audit-log.service';
import { GOVERNANCE_BACKUP_CONFIG, GovernanceBackupConfig } from './backups.service';

export const RESTORE_CLOCK = Symbol('RESTORE_CLOCK');
export const RESTORE_TOKEN_FACTORY = Symbol('RESTORE_TOKEN_FACTORY');

@Injectable()
export class RestorePreflightService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly filesystem: BackupFilesystem,
    private readonly runner: ProcessRunner,
    private readonly audit: AuditLogService,
    @Inject(GOVERNANCE_BACKUP_CONFIG) private readonly config: GovernanceBackupConfig,
    @Optional() @Inject(RESTORE_CLOCK) private readonly clock: () => Date = () => new Date(),
    @Optional() @Inject(RESTORE_TOKEN_FACTORY)
    private readonly tokenFactory: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  async create(backupId: string) {
    try {
      const backup = await this.prisma.backupRecord.findUnique({ where: { id: backupId } });
      if (
        !backup
        || (backup.status !== BackupStatus.CREATED && backup.status !== BackupStatus.VERIFIED)
      ) {
        throw new Error('Backup is not restorable');
      }
      if (!backup.manifestSha256) throw new Error('Backup manifest hash is missing');

      const manifestFile = await this.filesystem.readJson(`${backup.relativeDirectory}/manifest.json`);
      if (manifestFile.sha256 !== backup.manifestSha256) throw new Error('Backup manifest changed');
      const manifest = parseBackupManifest(manifestFile.value);
      if (manifest.appVersion !== this.config.appVersion) throw new Error('Backup app version is incompatible');
      const paths = this.filesystem.validateManifestPaths([
        manifest.database.path,
        ...manifest.files.map((file) => file.path),
      ]);
      if (paths.slice(1).some((path) => !path.startsWith('files/'))) {
        throw new Error('Backup file path is invalid');
      }
      for (const entry of [manifest.database, ...manifest.files]) {
        const actual = await this.filesystem.hashFile(`${backup.relativeDirectory}/${entry.path}`);
        if (actual.byteSize !== entry.byteSize || actual.sha256 !== entry.sha256) {
          throw new Error('Backup payload changed');
        }
      }

      const currentSchema = await this.migrationHead();
      if (manifest.schemaVersion !== currentSchema || backup.schemaVersion !== currentSchema) {
        throw new Error('Backup schema is incompatible');
      }
      const stats = await this.filesystem.filesystemStats();
      const requiredBytes = BigInt(manifest.database.byteSize + manifest.files.reduce(
        (total, entry) => total + entry.byteSize,
        0,
      )) * 2n;
      if (stats.availableBytes < requiredBytes) throw new Error('Insufficient free space');

      const toolVersion = await this.runner.run({
        executable: 'pg_restore',
        args: ['--version'],
        env: process.env,
      });
      const majorVersion = Number(toolVersion.stdout.match(/(\d+)(?:\.\d+)?/)?.[1]);
      if (!Number.isInteger(majorVersion) || majorVersion < 15) {
        throw new Error('pg_restore version is incompatible');
      }
      await this.runner.run({
        executable: 'pg_restore',
        args: ['--list', 'database.dump'],
        cwd: await this.filesystem.absolutePath(backup.relativeDirectory, true),
        env: process.env,
      });

      const now = this.clock();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);
      const confirmationToken = this.tokenFactory();
      const confirmationHash = this.hashToken(confirmationToken);
      const warnings: string[] = [];
      const summary = {
        fileCount: manifest.files.length,
        byteSize: Number(backup.byteSize),
        schemaVersion: manifest.schemaVersion,
        currentHealth: 'PREFLIGHT_VERIFIED',
      };
      await this.prisma.restorePreflight.updateMany({
        where: { backupId, status: RestorePreflightStatus.READY },
        data: { status: RestorePreflightStatus.INVALID },
      });
      const preflight = await this.prisma.restorePreflight.create({
        data: {
          backupId,
          manifestSha256: manifestFile.sha256,
          status: RestorePreflightStatus.READY,
          warnings,
          summary,
          confirmationHash,
          expiresAt,
        },
      });
      await this.audit.record({
        action: 'RESTORE_PREFLIGHT',
        entityType: 'backup',
        entityId: backupId,
        outcome: 'SUCCEEDED',
        changedFields: [],
        metadata: { status: RestorePreflightStatus.READY, fileCount: manifest.files.length, sha256: manifestFile.sha256 },
      });
      return {
        id: preflight.id,
        backupId,
        manifestSha256: manifestFile.sha256,
        confirmationToken,
        expiresAt,
        warnings,
        summary,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({
        code: ErrorCodes.RESTORE_PREFLIGHT_INVALID,
        message: 'Restore preflight did not pass',
        statusCode: HttpStatus.CONFLICT,
        cause: error,
      });
    }
  }

  async consume(input: {
    backupId: string;
    preflightId: string;
    confirmationToken: string;
    expectedHash: string;
  }) {
    const now = this.clock();
    return this.prisma.$transaction(async (tx) => {
      const preflight = await tx.restorePreflight.findUnique({
        where: { id: input.preflightId },
        include: { backup: true },
      });
      const valid = preflight
        && preflight.backupId === input.backupId
        && preflight.status === RestorePreflightStatus.READY
        && preflight.expiresAt > now
        && preflight.manifestSha256 === input.expectedHash
        && preflight.backup.manifestSha256 === input.expectedHash
        && this.hashToken(input.confirmationToken) === preflight.confirmationHash;
      if (!valid) {
        if (preflight?.status === RestorePreflightStatus.READY && preflight.expiresAt <= now) {
          await tx.restorePreflight.update({
            where: { id: preflight.id },
            data: { status: RestorePreflightStatus.EXPIRED },
          });
        }
        throw new AppError({
          code: ErrorCodes.RESTORE_CONFIRMATION_INVALID,
          message: 'Restore confirmation is invalid or expired',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      const manifest = await this.filesystem.readJson(`${preflight.backup.relativeDirectory}/manifest.json`);
      if (manifest.sha256 !== input.expectedHash) {
        await tx.restorePreflight.update({
          where: { id: preflight.id },
          data: { status: RestorePreflightStatus.INVALID },
        });
        throw new AppError({
          code: ErrorCodes.RESTORE_PREFLIGHT_INVALID,
          message: 'Backup changed after preflight',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      await tx.restorePreflight.update({
        where: { id: preflight.id },
        data: { status: RestorePreflightStatus.CONSUMED },
      });
      return preflight.backup;
    });
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private async migrationHead() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT migration_name FROM app._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1',
    );
    return rows[0]?.migration_name ?? 'baseline';
  }
}
