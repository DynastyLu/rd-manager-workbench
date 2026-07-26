import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { DocumentsService } from './application/documents.service';
import { FilesService } from './application/files.service';
import { KnowledgeSpacesService } from './application/knowledge-spaces.service';
import {
  DocumentsController,
  KnowledgeSpacesController,
} from './interface/http/content.controller';
import { FilesController } from './interface/http/files.controller';

@Module({
  imports: [StorageModule],
  controllers: [KnowledgeSpacesController, DocumentsController, FilesController],
  providers: [KnowledgeSpacesService, DocumentsService, FilesService],
  exports: [DocumentsService, FilesService],
})
export class ContentModule {}
