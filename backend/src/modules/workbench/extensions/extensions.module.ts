import { Module } from '@nestjs/common';
import { ExtensionsService } from './application/extensions.service';
import { SmsDeliveryService } from './application/sms-delivery.service';
import { ExtensionSchedulerService } from './application/extension-scheduler.service';
import { ExtensionsGateway } from './extensions.gateway';
import { AiContextService } from './application/ai-context.service';
import { ExternalSyncService } from './application/external-sync.service';
import { ExternalSyncCompletionService } from './application/external-sync-completion.service';
import { AiAdoptionService } from './application/ai-adoption.service';
import { ContentModule } from '../content/content.module';
import { ManagementModule } from '../management/management.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import {
  ExtensionProfilesController,
  ExtensionRunsController,
  ExtensionSmsController,
  ExtensionAiController,
  ExtensionSyncController,
} from './interface/http/extensions.controller';

@Module({
  imports: [ContentModule, ManagementModule, StorageModule],
  controllers: [ExtensionProfilesController, ExtensionRunsController, ExtensionSmsController, ExtensionAiController, ExtensionSyncController],
  providers: [ExtensionsService, SmsDeliveryService, ExtensionSchedulerService, ExtensionsGateway, AiContextService, AiAdoptionService, ExternalSyncCompletionService, ExternalSyncService],
  exports: [ExtensionsService, SmsDeliveryService, ExtensionsGateway, AiContextService, AiAdoptionService, ExternalSyncService],
})
export class ExtensionsModule {}
