import { Module } from '@nestjs/common';
import { ApplicationsService } from './application/applications.service';
import { ApplicationCasesController } from './interface/http/application-cases.controller';
import { WorkflowTemplatesController } from './interface/http/workflow-templates.controller';

@Module({
  controllers: [ApplicationCasesController, WorkflowTemplatesController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
