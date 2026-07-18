import { Module } from '@nestjs/common';
import { WorkbenchStatusController } from './interface/http/workbench-status.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [DashboardModule, ProjectsModule, TasksModule],
  controllers: [WorkbenchStatusController],
})
export class WorkbenchModule {}
