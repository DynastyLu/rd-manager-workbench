import { Module } from '@nestjs/common';
import { ProjectHealthService } from './application/project-health.service';
import { ProjectHealthSnapshotService } from './application/project-health-snapshot.service';
import { ProjectProgressService } from './application/project-progress.service';
import { ProjectsService } from './application/projects.service';
import { ProjectsController } from './interface/http/projects.controller';

@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectHealthService,
    ProjectHealthSnapshotService,
    ProjectProgressService,
    ProjectsService,
  ],
  exports: [
    ProjectHealthService,
    ProjectHealthSnapshotService,
    ProjectProgressService,
    ProjectsService,
  ],
})
export class ProjectsModule {}
