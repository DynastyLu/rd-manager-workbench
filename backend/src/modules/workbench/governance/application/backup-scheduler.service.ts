import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { BackupKind } from '@prisma/client';
import { BackupsService } from './backups.service';
import { GovernanceSettingsService } from './governance-settings.service';

const SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class BackupSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private readonly failedAttempts = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly settings: GovernanceSettingsService,
    private readonly backups: BackupsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.RD_MAINTENANCE_MODE === '1') return;
    void this.scan().catch((error: unknown) => this.logFailure(error));
    this.timer = setInterval(() => {
      void this.scan().catch((error: unknown) => this.logFailure(error));
    }, SCAN_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async scan(now = new Date()): Promise<{ created: boolean; reason?: string }> {
    const setting = await this.settings.get();
    if (!setting.autoBackupEnabled) return { created: false, reason: 'DISABLED' };
    const localDateKey = this.localDateKey(now);
    if (
      setting.lastAutoBackupLocalDate &&
      this.utcDateKey(setting.lastAutoBackupLocalDate) === localDateKey
    ) {
      return { created: false, reason: 'ALREADY_DONE' };
    }
    if (this.localTimeKey(now) < setting.autoBackupTimeLocal) {
      return { created: false, reason: 'NOT_DUE' };
    }
    const localDate = new Date(`${localDateKey}T00:00:00.000Z`);
    const persistedAttempts = await this.backups.scheduledAttemptCount(localDate);
    const attempts = Math.max(this.failedAttempts.get(localDateKey) ?? 0, persistedAttempts);
    if (attempts >= 3) return { created: false, reason: 'RETRY_LIMIT' };
    try {
      await this.backups.createScheduled(localDate, { kind: BackupKind.SCHEDULED });
      await this.settings.markAutoBackupSucceeded(localDate);
      this.failedAttempts.delete(localDateKey);
      await this.backups.applyRetention(setting.retentionDays, now);
      this.dropOldAttemptCounters(localDateKey);
      return { created: true };
    } catch (error) {
      this.failedAttempts.set(localDateKey, attempts + 1);
      throw error;
    }
  }

  private localDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private localTimeKey(date: Date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private utcDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private dropOldAttemptCounters(current: string) {
    for (const key of this.failedAttempts.keys()) if (key !== current) this.failedAttempts.delete(key);
  }

  private logFailure(error: unknown) {
    this.logger.error('Automatic backup scan failed', error instanceof Error ? error.stack : undefined);
  }
}
