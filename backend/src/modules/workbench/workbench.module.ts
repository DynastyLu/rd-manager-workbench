import { Module } from '@nestjs/common';
import { WorkbenchStatusController } from './interface/http/workbench-status.controller';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [ProjectsModule, TasksModule],
  controllers: [WorkbenchStatusController],
})
export class WorkbenchModule {}
