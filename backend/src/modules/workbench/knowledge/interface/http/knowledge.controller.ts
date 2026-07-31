import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthorizationService } from '../../../../iam/application/authorization.service';
import { ConnectionTicketService } from '../../../../iam/application/connection-ticket.service';
import { RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
import { AppError } from '../../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../../shared/errors/error-codes';
import { SessionService } from '../../application/session.service';
import { RagService } from '../../application/rag.service';
import { IndexingService } from '../../application/indexing.service';
import { KnowledgeIngestionService } from '../../application/knowledge-ingestion.service';
import { KnowledgeFileService } from '../../application/knowledge-file.service';
import { EmbeddingService } from '../../application/embedding.service';
import { FolderWatchService } from '../../application/folder-watch.service';
import { WorkbookPreviewService } from '../../application/workbook-preview.service';
import {
  IndexHealthCategory,
  IndexHealthService,
} from '../../application/index-health.service';
import { KnowledgeSpacesService } from '../../../content/application/knowledge-spaces.service';
import type { UploadedContentFile } from '../../../content/application/files.service';
import {
  ChatMessageDto,
  CreateSessionDto,
  ListSessionsQueryDto,
  UpdateSessionDto,
} from './dto/knowledge.dto';
import { KnowledgeMessagePageDto } from './dto/knowledge-pagination.dto';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly sessions: SessionService,
    private readonly rag: RagService,
    private readonly indexing: IndexingService,
    private readonly ingestion: KnowledgeIngestionService,
    private readonly knowledgeFiles: KnowledgeFileService,
    private readonly embeddings: EmbeddingService,
    private readonly spaces: KnowledgeSpacesService,
    private readonly folderWatch: FolderWatchService,
    private readonly workbookPreview: WorkbookPreviewService,
    private readonly indexHealth: IndexHealthService,
    private readonly connectionTickets: ConnectionTicketService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Post('sessions')
  @RequirePermissions('document.read')
  createSession(@Body() dto: CreateSessionDto) {
    return this.sessions.create(dto.question);
  }

  @Get('sessions')
  @RequirePermissions('document.read')
  listSessions(@Query() query: ListSessionsQueryDto) {
    return this.sessions.list(query);
  }

  @Get('sessions/:id')
  @RequirePermissions('document.read')
  getSession(@Param('id') id: string, @Query() query: KnowledgeMessagePageDto) {
    return this.sessions.get(id, query);
  }

  @Patch('sessions/:id')
  @RequirePermissions('document.read')
  updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.sessions.update(id, dto as Parameters<SessionService['update']>[1]);
  }

  @Delete('sessions/:id')
  @RequirePermissions('document.read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(@Param('id') id: string) {
    await this.sessions.archive(id);
  }

  @Post('chat/:sessionId/messages')
  @RequirePermissions('document.read')
  async chat(
    @Param('sessionId') sessionId: string,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ) {
    const writeEvent = (name: string, payload: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    };
    try {
      const session = await this.sessions.get(sessionId);
      const userMessage = await this.sessions.addMessage(sessionId, {
        role: 'USER',
        content: dto.question,
      });
      const history = await this.sessions.getHistory(sessionId);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      writeEvent('retrieval_started', { scope: session.scope });
      const { stream, citations, totalFound, relevantCount, searchedDocumentCount, hasEvidence } =
        await this.rag.ask({
          question: dto.question,
          history: history.slice(0, -1),
          scope: session.scope,
        });
      writeEvent('retrieval_completed', {
        searchedDocumentCount,
        totalFound,
        relevantCount,
        hasEvidence,
      });

      if (!hasEvidence || !stream) {
        const content =
          '在当前检索范围内没有找到可用于回答的已索引内容。请检查文件是否已完成索引，或调整检索范围后重试。';
        const message = await this.sessions.addMessage(sessionId, {
          role: 'ASSISTANT',
          content,
          citations: [],
          tokenCount: Math.ceil(content.length / 2),
          replyToMessageId: userMessage.id,
        });
        writeEvent('answer_delta', { text: content });
        writeEvent('completed', {
          messageId: message.id,
          tokenCount: message.tokenCount ?? 0,
          hasEvidence: false,
        });
        res.end();
        return;
      }

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                writeEvent('answer_delta', { text: content });
              }
            } catch {
              /* skip malformed upstream event */
            }
          }
        }
      }

      // Save before `done`: the frontend refetches the session immediately.
      const assistantMessage = await this.sessions.addMessage(sessionId, {
        role: 'ASSISTANT',
        content: fullContent,
        citations: citations.map((citation) => ({
          documentId: citation.documentId,
          title: citation.title,
          chunkIndex: citation.chunkIndex,
          text: citation.text,
          pageNumber: citation.pageNumber,
          sheetName: citation.sheetName,
          locationLabel: citation.locationLabel,
        })),
        tokenCount: Math.ceil(fullContent.length / 2),
        replyToMessageId: userMessage.id,
      });
      for (const citation of citations) writeEvent('citation', citation);
      writeEvent('completed', {
        messageId: assistantMessage.id,
        tokenCount: assistantMessage.tokenCount ?? 0,
        hasEvidence: true,
      });
      void this.sessions.logUsage({
        operation: 'KNOWLEDGE_QA',
        model: 'deepseek-v4-pro',
        tokenCount: Math.ceil((dto.question.length + fullContent.length) / 2),
        success: true,
        sessionId,
      });
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      }
      if (!res.writableEnded) {
        writeEvent('failed', {
          code: 'KNOWLEDGE_ANSWER_FAILED',
          message,
          retryable: true,
        });
        res.end();
      }
    }
  }

  @Get('reindex/status')
  @RequirePermissions('knowledge.admin')
  getReindexStatus() {
    return this.indexing.getStatus();
  }

  @Post('reindex')
  @RequirePermissions('knowledge.admin')
  triggerReindex() {
    return this.indexing.indexAll();
  }

  @Get('index-health')
  @RequirePermissions('knowledge.admin')
  getIndexHealth(@Query('category') category?: IndexHealthCategory) {
    return this.indexHealth.list(category);
  }

  @Post('index-health/retry-all')
  @RequirePermissions('knowledge.admin')
  retryAllIndexHealth(@Query('category') category?: IndexHealthCategory) {
    return this.indexHealth.retryAll(category);
  }

  @Post('index-health/:id/retry')
  @RequirePermissions('knowledge.admin')
  retryIndexHealth(@Param('id') id: string) {
    return this.indexHealth.retryOne(id);
  }

  @Post('index-health/:id/ignore')
  @RequirePermissions('knowledge.admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async ignoreIndexHealth(@Param('id') id: string) {
    await this.indexHealth.ignore(id);
  }

  @Get('usage')
  @RequirePermissions('knowledge.admin')
  getUsage() {
    return this.sessions.getUsageStats();
  }

  @Get('embeddings/status')
  @RequirePermissions('knowledge.admin')
  async getEmbeddingStatus() {
    const status = this.embeddings.getStatus();
    return {
      ...status,
      reindex: status.ready ? await this.indexing.getStatus() : null,
    };
  }

  @Post('embeddings/prepare')
  @RequirePermissions('knowledge.admin')
  async prepareEmbeddingModel() {
    await this.embeddings.prepare();
    const status = this.embeddings.getStatus();
    if (!status.ready) return status;
    const reindex = await this.indexing.indexAll();
    return {
      ...status,
      reindexJobId: reindex.jobId,
    };
  }

  @Post('documents/upload')
  @RequirePermissions('document.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadDocument(@UploadedFile() file: UploadedContentFile | undefined) {
    return this.ingestion.upload(file);
  }

  @Get('documents/:id/source')
  @RequirePermissions('document.read')
  async getDocumentSource(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.knowledgeFiles.getOriginal(id);
    this.sendFile(res, file, download === '1' ? 'attachment' : 'inline');
  }

  @Get('documents/:id/preview')
  @RequirePermissions('document.read')
  async getDocumentPreview(@Param('id') id: string, @Res() res: Response) {
    const file = await this.knowledgeFiles.getPreview(id);
    this.sendFile(res, file, 'inline');
  }

  @Get('documents/:id/workbook')
  @RequirePermissions('document.read')
  async getDocumentWorkbook(@Param('id') id: string) {
    const file = await this.knowledgeFiles.getOriginal(id);
    return this.workbookPreview.parse(file);
  }

  @Get('documents/:id/local-open-path')
  @RequirePermissions('document.read')
  getLocalOpenPath(@Param('id') id: string) {
    return this.knowledgeFiles.getLocalOpenPath(id);
  }

  // ── Folder Watch ──

  @Get('folders')
  @RequirePermissions('document.read')
  listFolders() {
    return this.folderWatch.list();
  }

  @Get('folders/:id')
  @RequirePermissions('document.read')
  getFolder(@Param('id') id: string) {
    return this.folderWatch.get(id);
  }

  @Post('folders')
  @RequirePermissions('document.read')
  async startWatchingFolder(
    @Body() body: { folderPath: string; label?: string; spaceId?: string; recursive?: boolean },
  ) {
    if (!body.folderPath?.trim()) throw new Error('folderPath is required');

    // Auto-create a space if not provided
    let spaceId = body.spaceId;
    if (!spaceId) {
      const folderName = body.label || body.folderPath.split('/').pop() || '本地文件夹';
      const space = await this.spaces.create({ name: folderName });
      spaceId = space.id;
    }

    const watchId = await this.folderWatch.startWatching({
      folderPath: body.folderPath.trim(),
      label: body.label,
      spaceId,
      recursive: body.recursive,
    });

    return { watchId, spaceId };
  }

  @Delete('folders/:id')
  @RequirePermissions('document.read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stopWatchingFolder(@Param('id') id: string) {
    await this.folderWatch.stopWatching(id);
  }

  @Post('folders/:id/rescan')
  @RequirePermissions('document.read')
  @HttpCode(HttpStatus.ACCEPTED)
  async rescanFolder(@Param('id') id: string) {
    return this.folderWatch.rescan(id);
  }

  @Post('folders/:id/retry-failed')
  @RequirePermissions('document.read')
  @HttpCode(HttpStatus.ACCEPTED)
  retryFailedFolderFiles(@Param('id') id: string) {
    return this.folderWatch.retryFailed(id);
  }

  @Sse('folders/:id/progress')
  async folderProgress(
    @Param('id') id: string,
    @Query('ticket') ticket: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    const principal = await this.connectionTickets.consume(ticket ?? '', 'knowledge-sse');
    if (!this.authorization.hasPermission(principal, 'document.read')) {
      throw new AppError({
        code: ErrorCodes.PERMISSION_DENIED,
        message: 'Permission denied',
        statusCode: HttpStatus.FORBIDDEN,
      });
    }
    return this.folderWatch.getProgressStream(id).pipe(map((data) => ({ data })));
  }

  @Get('folders/:id/progress-snapshot')
  @RequirePermissions('document.read')
  folderProgressSnapshot(@Param('id') id: string) {
    return (
      this.folderWatch.getProgress(id) ?? {
        phase: 'done',
        total: 0,
        current: 0,
        scanned: 0,
        currentFile: '',
        percent: 100,
      }
    );
  }

  private sendFile(
    res: Response,
    file: { content: Buffer; fileName: string; mimeType: string; sha256: string },
    disposition: 'inline' | 'attachment',
  ): void {
    const encodedFileName = encodeURIComponent(file.fileName);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.content.length);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('ETag', `"sha256-${file.sha256}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.content);
  }
}
