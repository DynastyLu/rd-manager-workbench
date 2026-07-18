import { Module } from '@nestjs/common';
import { WorkbenchStatusController } from './interface/http/workbench-status.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { ApplicationsModule } from './applications/applications.module';
import { ManagementModule } from './management/management.module';
import { CalendarModule } from './calendar/calendar.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ContentModule } from './content/content.module';
import { BaseModule } from './base/base.module';

@Module({
  imports: [
    DashboardModule,
    ProjectsModule,
    TasksModule,
    ApplicationsModule,
    ManagementModule,
    CalendarModule,
    NotificationsModule,
    ContentModule,
    BaseModule,
  ],
  controllers: [WorkbenchStatusController],
})
export class WorkbenchModule {}
