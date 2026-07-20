import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { ManagementModule } from '../management/management.module';
import { TasksModule } from '../tasks/tasks.module';
import { ApplicationsSearchAdapter } from './adapters/applications-search.adapter';
import { BaseSearchAdapter } from './adapters/base-search.adapter';
import { ContentSearchAdapter } from './adapters/content-search.adapter';
import { ManagementSearchAdapter } from './adapters/management-search.adapter';
import { OperationsSearchAdapter } from './adapters/operations-search.adapter';
import { ProjectsSearchAdapter } from './adapters/projects-search.adapter';
import { TasksSearchAdapter } from './adapters/tasks-search.adapter';
import { SearchActionsService } from './application/search-actions.service';
import { SEARCH_ADAPTERS, SearchService } from './application/search.service';
import { SearchAdapter } from './domain/search.types';
import { SearchController } from './interface/http/search.controller';

@Module({
  imports: [TasksModule, ContentModule, ManagementModule],
  controllers: [SearchController],
  providers: [
    ProjectsSearchAdapter,
    TasksSearchAdapter,
    ApplicationsSearchAdapter,
    ContentSearchAdapter,
    ManagementSearchAdapter,
    OperationsSearchAdapter,
    BaseSearchAdapter,
    {
      provide: SEARCH_ADAPTERS,
      inject: [
        ProjectsSearchAdapter,
        TasksSearchAdapter,
        ApplicationsSearchAdapter,
        ContentSearchAdapter,
        ManagementSearchAdapter,
        OperationsSearchAdapter,
        BaseSearchAdapter,
      ],
      useFactory: (...adapters: SearchAdapter[]) => adapters,
    },
    SearchService,
    SearchActionsService,
  ],
  exports: [SearchService],
})
export class SearchModule {}
