import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { ManagementModule } from '../management/management.module';
import { TasksModule } from '../tasks/tasks.module';
import { IntelligenceCatalogService } from './application/intelligence-catalog.service';
import { IntelligenceRunsService } from './application/intelligence-runs.service';
import { IntelligenceItemsService } from './application/intelligence-items.service';
import { IntelligenceConversionsService } from './application/intelligence-conversions.service';
import { IntelligenceBriefsService } from './application/intelligence-briefs.service';
import {
  IntelligencePlansController,
  IntelligenceRunsController,
  IntelligenceSourcesController,
  IntelligenceTopicsController,
  IntelligenceItemsController,
  IntelligenceBriefsController,
} from './interface/http/intelligence.controller';

@Module({
  imports: [TasksModule, ManagementModule, ContentModule],
  controllers: [
    IntelligenceTopicsController,
    IntelligenceSourcesController,
    IntelligencePlansController,
    IntelligenceRunsController,
    IntelligenceItemsController,
    IntelligenceBriefsController,
  ],
  providers: [IntelligenceCatalogService, IntelligenceRunsService, IntelligenceItemsService, IntelligenceConversionsService, IntelligenceBriefsService],
  exports: [IntelligenceCatalogService, IntelligenceRunsService, IntelligenceItemsService, IntelligenceBriefsService],
})
export class IntelligenceModule {}
