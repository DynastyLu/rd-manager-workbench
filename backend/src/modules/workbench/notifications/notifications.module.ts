import { Module } from '@nestjs/common';
import { NotificationsService } from './application/notifications.service';
import { NotificationsController } from './interface/http/notifications.controller';
import { RemindersService } from './application/reminders.service';
import { RemindersController } from './interface/http/reminders.controller';
import { ReminderSchedulerService } from './application/reminder-scheduler.service';
import { NotificationsGateway } from './notifications.gateway';
import { ExtensionsModule } from '../extensions/extensions.module';
import { GovernanceModule } from '../governance/governance.module';
import { EmployeeWeekPlanReminderCandidatesService } from './application/employee-week-plan-reminder-candidates.service';
import { EmployeeWeekPlanReminderSyncService } from './application/employee-week-plan-reminder-sync.service';
import { ReminderMaintenanceCoordinatorService } from './application/reminder-maintenance-coordinator.service';

@Module({
  imports: [ExtensionsModule, GovernanceModule],
  controllers: [NotificationsController, RemindersController],
  providers: [
    NotificationsService,
    RemindersService,
    ReminderSchedulerService,
    NotificationsGateway,
    EmployeeWeekPlanReminderCandidatesService,
    EmployeeWeekPlanReminderSyncService,
    ReminderMaintenanceCoordinatorService,
  ],
  exports: [NotificationsGateway],
})
export class NotificationsModule {}
