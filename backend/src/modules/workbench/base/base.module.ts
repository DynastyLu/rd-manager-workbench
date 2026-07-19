import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { ManagementModule } from '../management/management.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { SystemRecordsAdapter } from './adapters/system-records.adapter';
import { BaseController } from './base.controller';
import { BaseService } from './base.service';
import { FieldConfigService } from './field-config.service';
import { RelationSyncService } from './relation-sync.service';

@Module({
  imports: [ProjectsModule, TasksModule, ManagementModule, ContentModule],
  controllers: [BaseController],
  providers: [BaseService, FieldConfigService, RelationSyncService, SystemRecordsAdapter],
  exports: [BaseService],
})
export class BaseModule {}
