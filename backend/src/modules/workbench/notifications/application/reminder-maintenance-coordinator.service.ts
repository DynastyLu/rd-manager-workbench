import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { EmployeeWeekPlanReminderSyncService } from './employee-week-plan-reminder-sync.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';

const MAINTENANCE_INTERVAL_MS = 30_000;
type ReminderMaintenanceStage = 'employee-plan-sync' | 'due-reminder-scan';

class ReminderMaintenanceFailure extends Error {
  readonly failedStages: ReminderMaintenanceStage[];

  constructor(failedStages: ReminderMaintenanceStage[]) {
    super('One or more reminder maintenance stages failed');
    this.name = 'ReminderMaintenanceFailure';
    this.failedStages = failedStages;
  }
}

@Injectable()
export class ReminderMaintenanceCoordinatorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReminderMaintenanceCoordinatorService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly employeePlanSync: EmployeeWeekPlanReminderSyncService,
    private readonly reminderScheduler: ReminderSchedulerService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.RD_MAINTENANCE_MODE === '1') return;
    void this.runMaintenance().catch((error: unknown) => this.logFailure(error));
    this.timer = setInterval(() => {
      void this.runMaintenance().catch((error: unknown) => this.logFailure(error));
    }, MAINTENANCE_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runMaintenance(now = new Date()) {
    if (this.running) return { skipped: true as const };
    this.running = true;
    try {
      const failedStages: ReminderMaintenanceStage[] = [];
      let sync: Awaited<ReturnType<EmployeeWeekPlanReminderSyncService['sync']>> | undefined;
      let scan: Awaited<ReturnType<ReminderSchedulerService['scanDue']>> | undefined;
      try {
        sync = await this.employeePlanSync.sync(now);
      } catch {
        failedStages.push('employee-plan-sync');
      }
      try {
        scan = await this.reminderScheduler.scanDue(now);
      } catch {
        failedStages.push('due-reminder-scan');
      }
      if (failedStages.length) throw new ReminderMaintenanceFailure(failedStages);
      return { sync: sync!, scan: scan! };
    } finally {
      this.running = false;
    }
  }

  private logFailure(error: unknown): void {
    if (error instanceof ReminderMaintenanceFailure) {
      this.logger.error(
        `Reminder maintenance failed in ${error.failedStages.join(', ')}; it will retry on the next interval.`,
      );
      return;
    }
    this.logger.error(
      'Reminder maintenance failed unexpectedly; it will retry on the next interval.',
    );
  }
}
