import { Module } from '@nestjs/common';
import { WorkbenchStatusController } from './interface/http/workbench-status.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { ApplicationsModule } from './applications/applications.module';

@Module({
  imports: [DashboardModule, ProjectsModule, TasksModule, ApplicationsModule],
  controllers: [WorkbenchStatusController],
})
export class WorkbenchModule {}
