import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { ManagementModule } from '../management/management.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { SystemRecordsAdapter } from './adapters/system-records.adapter';
import { BaseController } from './base.controller';
import { BaseService } from './base.service';
import { ComputedFieldResolver } from './computed-field-resolver.service';
import { FieldConfigService } from './field-config.service';
import { RelationSyncService } from './relation-sync.service';
import { ViewQueryService } from './view-query.service';

@Module({
  imports: [ProjectsModule, TasksModule, ManagementModule, ContentModule],
  controllers: [BaseController],
  providers: [
    BaseService,
    ComputedFieldResolver,
    FieldConfigService,
    RelationSyncService,
    SystemRecordsAdapter,
    ViewQueryService,
  ],
  exports: [BaseService],
})
export class BaseModule {}
