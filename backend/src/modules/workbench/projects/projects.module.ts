import { Module } from '@nestjs/common';
import { ProjectHealthService } from './application/project-health.service';
import { ProjectsService } from './application/projects.service';
import { ProjectsController } from './interface/http/projects.controller';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectHealthService, ProjectsService],
  exports: [ProjectHealthService, ProjectsService],
})
export class ProjectsModule {}
