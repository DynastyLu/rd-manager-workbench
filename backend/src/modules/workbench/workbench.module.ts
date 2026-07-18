import { Module } from '@nestjs/common';
import { WorkbenchStatusController } from './interface/http/workbench-status.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { ApplicationsModule } from './applications/applications.module';
import { ManagementModule } from './management/management.module';
import { CalendarModule } from './calendar/calendar.module';

@Module({
  imports: [
    DashboardModule,
    ProjectsModule,
    TasksModule,
    ApplicationsModule,
    ManagementModule,
    CalendarModule,
  ],
  controllers: [WorkbenchStatusController],
})
export class WorkbenchModule {}
