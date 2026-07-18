import { Module } from '@nestjs/common';
import { ProjectHealthService } from './application/project-health.service';
import { ProjectHealthSnapshotService } from './application/project-health-snapshot.service';
import { ProjectsService } from './application/projects.service';
import { ProjectsController } from './interface/http/projects.controller';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectHealthService, ProjectHealthSnapshotService, ProjectsService],
  exports: [ProjectHealthService, ProjectHealthSnapshotService, ProjectsService],
})
export class ProjectsModule {}
