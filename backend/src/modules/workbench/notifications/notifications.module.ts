import { Module } from '@nestjs/common';
import { NotificationsService } from './application/notifications.service';
import { NotificationsController } from './interface/http/notifications.controller';
import { RemindersService } from './application/reminders.service';
import { RemindersController } from './interface/http/reminders.controller';
import { ReminderSchedulerService } from './application/reminder-scheduler.service';
import { NotificationsGateway } from './notifications.gateway';
import { ExtensionsModule } from '../extensions/extensions.module';

@Module({
  imports: [ExtensionsModule],
  controllers: [NotificationsController, RemindersController],
  providers: [
    NotificationsService,
    RemindersService,
    ReminderSchedulerService,
    NotificationsGateway,
  ],
})
export class NotificationsModule {}
