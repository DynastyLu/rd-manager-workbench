import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { BackupStatus, RestorePreflightStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { PostgresToolsService } from './postgres-tools.service';

type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface HealthCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class DataHealthService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
    private readonly tools: PostgresToolsService,
  ) {}

  async check(input: { deep?: boolean; expectedMigrationHead?: string } = {}) {
    const deep = input.deep ?? false;
    const checks: HealthCheck[] = [];
    checks.push(await this.databaseCheck(input.expectedMigrationHead ?? (await this.discoverMigrationHead())));
    checks.push(await this.storageCheck());
    checks.push(await this.fileCheck(deep));
    checks.push(await this.contentAssociationsCheck());
    checks.push(await this.jobsCheck(new Date()));
    checks.push(await this.backupCheck());
    checks.push(await this.postgresToolsCheck());
    checks.push(await this.notificationsCheck());
    const status = checks.some((check) => check.status === 'FAIL')
      ? 'UNHEALTHY'
      : checks.some((check) => check.status === 'WARN')
        ? 'WARNING'
        : 'HEALTHY';
    return { status, mode: deep ? 'DEEP' : 'FAST', checkedAt: new Date(), checks };
  }

  private async databaseCheck(expectedMigrationHead?: string): Promise<HealthCheck> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string; failed_count?: number }>>(
        `SELECT migration_name,
          (SELECT COUNT(*)::int FROM app._prisma_migrations
            WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS failed_count
         FROM app._prisma_migrations
         WHERE finished_at IS NOT NULL
         ORDER BY migration_name DESC LIMIT 1`,
      );
      const actual = rows[0]?.migration_name ?? null;
      const failedCount = rows[0]?.failed_count ?? 0;
      const drift = Boolean(failedCount || (expectedMigrationHead && actual !== expectedMigrationHead));
      return {
        key: 'database.schema',
        label: 'PostgreSQL 与迁移',
        status: drift ? 'FAIL' : 'PASS',
        detail: drift ? '数据库迁移版本与应用不一致' : '数据库连接与迁移版本正常',
        details: { migrationHead: actual, expectedMigrationHead: expectedMigrationHead ?? null, failedCount },
      };
    } catch {
      return { key: 'database.schema', label: 'PostgreSQL 与迁移', status: 'FAIL', detail: '数据库健康检查失败' };
    }
  }

  private async storageCheck(): Promise<HealthCheck> {
    try {
      await this.storage.checkHealth();
      const stats = await this.storage.statfs();
      return {
        key: 'storage.root',
        label: '本地文件目录',
        status: 'PASS',
        detail: '本地文件目录可读写',
        details: {
          availableBytes: stats.availableBytes.toString(),
          totalBytes: stats.totalBytes.toString(),
        },
      };
    } catch {
      return { key: 'storage.root', label: '本地文件目录', status: 'FAIL', detail: '本地文件目录不可用' };
    }
  }

  private async fileCheck(deep: boolean): Promise<HealthCheck> {
    const versions = await this.prisma.fileVersion.findMany({
      select: { id: true, storageKey: true, size: true, sha256: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: deep ? undefined : 100,
    });
    let missing = 0;
    let mismatched = 0;
    for (const version of versions) {
      try {
        const stat = await this.storage.stat(version.storageKey);
        if (stat.kind !== 'FILE' || stat.byteSize !== version.size) {
          mismatched += 1;
          continue;
        }
        const sha256 = createHash('sha256');
        const stream = await this.storage.openReadStream(version.storageKey);
        for await (const chunk of stream) sha256.update(chunk as Buffer);
        if (sha256.digest('hex') !== version.sha256) mismatched += 1;
      } catch {
        missing += 1;
      }
    }
    return {
      key: 'storage.files',
      label: '附件完整性',
      status: missing || mismatched ? 'FAIL' : 'PASS',
      detail: missing || mismatched ? '存在缺失或校验不一致的附件版本' : '附件版本完整性检查通过',
      details: { checked: versions.length, missing, mismatched },
    };
  }

  private async jobsCheck(now: Date): Promise<HealthCheck> {
    const [expiredPreflights, failedBackups] = await Promise.all([
      this.prisma.restorePreflight.count({
        where: { status: RestorePreflightStatus.READY, expiresAt: { lt: now } },
      }),
      this.prisma.backupRecord.count({ where: { status: BackupStatus.FAILED } }),
    ]);
    return {
      key: 'governance.jobs',
      label: '备份与恢复作业',
      status: failedBackups || expiredPreflights ? 'WARN' : 'PASS',
      detail: failedBackups || expiredPreflights ? '存在失败作业或过期预检' : '备份与恢复作业正常',
      details: { expiredPreflights, failedBackups },
    };
  }

  private async backupCheck(): Promise<HealthCheck> {
    const [latest, setting] = await Promise.all([
      this.prisma.backupRecord.findFirst({
        where: { status: { in: [BackupStatus.CREATED, BackupStatus.VERIFIED] } },
        orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, verifiedAt: true, createdAt: true },
      }),
      this.prisma.governanceSetting.findUnique({ where: { id: 'singleton' } }),
    ]);
    const latestAt = latest?.verifiedAt ?? latest?.createdAt ?? null;
    const maximumAgeDays = setting?.retentionDays ?? 30;
    const isRecent = Boolean(
      latestAt && Date.now() - latestAt.getTime() <= maximumAgeDays * 86_400_000,
    );
    return {
      key: 'backup.recent',
      label: '最近成功备份',
      status: isRecent ? 'PASS' : 'WARN',
      detail: isRecent ? '已有近期验证成功的备份' : '暂无近期验证成功的备份',
      details: {
        latestSuccessfulAt: latestAt,
        autoBackupEnabled: setting?.autoBackupEnabled ?? false,
      },
    };
  }

  private async postgresToolsCheck(): Promise<HealthCheck> {
    const tools = await this.tools.inspect();
    const compatible = [tools.pgDump, tools.pgRestore].every(
      (tool) => tool.available && Number(tool.version) >= 15,
    );
    return {
      key: 'postgres.tools',
      label: 'PostgreSQL 备份工具',
      status: compatible ? 'PASS' : 'FAIL',
      detail: compatible
        ? 'pg_dump 与 pg_restore 可用于备份恢复'
        : '缺少 PostgreSQL 15+ 的 pg_dump 或 pg_restore',
      details: tools,
    };
  }

  private async notificationsCheck(): Promise<HealthCheck> {
    const [pending, overdueReminders] = await Promise.all([
      this.prisma.notification.count({ where: { status: 'UNREAD' } }),
      this.prisma.reminderRule.count({
        where: { archivedAt: null, remindAt: { lt: new Date() }, notification: null },
      }),
    ]);
    return {
      key: 'notifications.pending',
      label: '提醒与通知',
      status: overdueReminders ? 'WARN' : 'PASS',
      detail: overdueReminders ? '存在逾期但尚未生成通知的提醒' : '提醒与通知队列正常',
      details: { itemCount: pending, overdueReminders },
    };
  }

  private async contentAssociationsCheck(): Promise<HealthCheck> {
    const [emptyAssets, missingAssociations, multipleAssociations] = await Promise.all([
      this.prisma.fileAsset.count({ where: { status: 'ACTIVE', versions: { none: {} } } }),
      this.prisma.fileAsset.count({
        where: {
          documentId: null,
          projectId: null,
          meetingId: null,
          partnerId: null,
          nonProjectRdItemId: null,
          nonProjectRdOutcomeId: null,
        },
      }),
      this.prisma.fileAsset.count({
        where: {
          OR: [
            { documentId: { not: null }, projectId: { not: null } },
            { documentId: { not: null }, meetingId: { not: null } },
            { projectId: { not: null }, meetingId: { not: null } },
            { documentId: { not: null }, partnerId: { not: null } },
            { projectId: { not: null }, partnerId: { not: null } },
            { meetingId: { not: null }, partnerId: { not: null } },
            { documentId: { not: null }, nonProjectRdItemId: { not: null } },
            { projectId: { not: null }, nonProjectRdItemId: { not: null } },
            { meetingId: { not: null }, nonProjectRdItemId: { not: null } },
            { partnerId: { not: null }, nonProjectRdItemId: { not: null } },
            { documentId: { not: null }, nonProjectRdOutcomeId: { not: null } },
            { projectId: { not: null }, nonProjectRdOutcomeId: { not: null } },
            { meetingId: { not: null }, nonProjectRdOutcomeId: { not: null } },
            { partnerId: { not: null }, nonProjectRdOutcomeId: { not: null } },
            { nonProjectRdItemId: { not: null }, nonProjectRdOutcomeId: { not: null } },
          ],
        },
      }),
    ]);
    return {
      key: 'content.associations',
      label: '内容与附件关联',
      status: emptyAssets || missingAssociations || multipleAssociations ? 'WARN' : 'PASS',
      detail: emptyAssets || missingAssociations || multipleAssociations
        ? '存在空附件、缺少归属或多重对象关联'
        : '内容与附件关联正常',
      details: { emptyAssets, missingAssociations, multipleAssociations },
    };
  }

  private async discoverMigrationHead(): Promise<string | undefined> {
    const candidates = [
      join(process.cwd(), 'prisma', 'migrations'),
      join(process.cwd(), 'backend', 'prisma', 'migrations'),
    ];
    for (const candidate of candidates) {
      try {
        const entries = await readdir(candidate, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
          .at(-1);
      } catch {
        // The packaged runtime can provide APP_MIGRATION_HEAD instead of source migration files.
      }
    }
    return process.env.APP_MIGRATION_HEAD;
  }
}
