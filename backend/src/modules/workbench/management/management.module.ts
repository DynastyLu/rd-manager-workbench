import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { DecisionsService } from './application/decisions.service';
import { IssuesService } from './application/issues.service';
import { ManagementReferenceService } from './application/management-reference.service';
import { MeetingsService } from './application/meetings.service';
import { PartnersService } from './application/partners.service';
import { RisksService } from './application/risks.service';
import { CommunicationsController, PartnersController } from './interface/http/partners.controller';
import { DecisionsController } from './interface/http/decisions.controller';
import { IssuesController } from './interface/http/issues.controller';
import { MeetingActionsController, MeetingsController } from './interface/http/meetings.controller';
import { RisksController } from './interface/http/risks.controller';

@Module({
  imports: [ProjectsModule, TasksModule],
  controllers: [RisksController, IssuesController, DecisionsController, PartnersController, CommunicationsController, MeetingsController, MeetingActionsController],
  providers: [ManagementReferenceService, RisksService, IssuesService, DecisionsService, PartnersService, MeetingsService],
  exports: [RisksService, MeetingsService],
})
export class ManagementModule {}
