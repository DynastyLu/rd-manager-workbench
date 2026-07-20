import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
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
import { BaseFileParserService } from './import/base-file-parser.service';
import { ImportRowConverterService } from './import/import-row-converter.service';
import { BaseImportService } from './import/base-import.service';
import { ImportCleanupService } from './import/import-cleanup.service';
import { BaseExportService } from './export/base-export.service';
import { BaseTemplateService } from './templates/base-template.service';

@Module({
  imports: [ProjectsModule, TasksModule, ManagementModule, ContentModule, StorageModule],
  controllers: [BaseController],
  providers: [
    BaseService,
    ComputedFieldResolver,
    FieldConfigService,
    RelationSyncService,
    SystemRecordsAdapter,
    ViewQueryService,
    BaseFileParserService,
    ImportRowConverterService,
    BaseImportService,
    ImportCleanupService,
    BaseExportService,
    BaseTemplateService,
  ],
  exports: [BaseService],
})
export class BaseModule {}
