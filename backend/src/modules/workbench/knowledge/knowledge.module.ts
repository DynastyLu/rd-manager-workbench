import { Module } from '@nestjs/common';
import { ChunkingService } from './application/chunking.service';
import { EmbeddingService } from './application/embedding.service';
import { DeepSeekHttpService } from './application/deepseek-http.service';
import { RagService } from './application/rag.service';
import { SessionService } from './application/session.service';
import { IndexingService } from './application/indexing.service';
import { KnowledgeController } from './interface/http/knowledge.controller';
import { KnowledgeGateway } from './knowledge.gateway';
import { EmbeddingCache } from './domain/embedding-cache';
import { DocumentImportService } from './application/document-import.service';
import { FolderWatchService } from './application/folder-watch.service';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [ContentModule],
  controllers: [KnowledgeController],
  providers: [
    ChunkingService,
    EmbeddingCache,
    KnowledgeGateway,
    {
      provide: EmbeddingService,
      useFactory: (cache: EmbeddingCache) => {
        const apiKey = process.env.DEEPSEEK_API_KEY || '';
        return new EmbeddingService(cache, apiKey);
      },
      inject: [EmbeddingCache],
    },
    {
      provide: DeepSeekHttpService,
      useFactory: () => {
        const apiKey = process.env.DEEPSEEK_API_KEY || '';
        return new DeepSeekHttpService(apiKey);
      },
    },
    RagService,
    SessionService,
    IndexingService,
    DocumentImportService,
    FolderWatchService,
  ],
  exports: [ChunkingService, EmbeddingService, RagService, SessionService, IndexingService, KnowledgeGateway, FolderWatchService],
})
export class KnowledgeModule {}
