import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TasksService } from './application/tasks.service';
import { ProjectExecutionController } from './interface/http/project-execution.controller';
import { TasksController } from './interface/http/tasks.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [TasksController, ProjectExecutionController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
