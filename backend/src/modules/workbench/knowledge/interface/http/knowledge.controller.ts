import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, MessageEvent,
  Param, Patch, Post, Query, Res, Sse, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SessionService } from '../../application/session.service';
import { RagService } from '../../application/rag.service';
import { IndexingService } from '../../application/indexing.service';
import { KnowledgeIngestionService } from '../../application/knowledge-ingestion.service';
import { KnowledgeFileService } from '../../application/knowledge-file.service';
import { EmbeddingService } from '../../application/embedding.service';
import { FolderWatchService } from '../../application/folder-watch.service';
import { KnowledgeSpacesService } from '../../../content/application/knowledge-spaces.service';
import type { UploadedContentFile } from '../../../content/application/files.service';
import { CreateSessionDto, ChatMessageDto } from './dto/knowledge.dto';

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
  ) {}

  @Post('sessions')
  createSession(@Body() dto: CreateSessionDto) {
    return this.sessions.create(dto.question);
  }

  @Get('sessions')
  listSessions() {
    return this.sessions.list();
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.sessions.get(id);
  }

  @Patch('sessions/:id')
  updateSession(@Param('id') id: string) {
    return this.sessions.archive(id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(@Param('id') id: string) {
    await this.sessions.archive(id);
  }

  @Post('chat/:sessionId/messages')
  async chat(
    @Param('sessionId') sessionId: string,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ) {
    try {
      await this.sessions.addMessage(sessionId, { role: 'USER', content: dto.question });
      const history = await this.sessions.getHistory(sessionId);

      const { stream, citations, totalFound, relevantCount } = await this.rag.ask({
        question: dto.question,
        history: history.slice(0, -1),
      });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Retrieval and the upstream model connection are ready before SSE headers.
      if (relevantCount === 0) {
        const msg = totalFound === 0
          ? `知识库中没有已索引的文档内容（0 个分块）。请先同步本地文件夹或上传文件。`
          : `检索了 ${totalFound} 个分块，没有找到与问题相关的内容（阈值 0.08）。请尝试换一种问法。`;
        res.write(`event: status\ndata: ${JSON.stringify({ phase: 'empty', message: msg, totalFound, relevantCount })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ finished: true })}\n\n`);
        res.end();
        return;
      }

      res.write(`event: status\ndata: ${JSON.stringify({ phase: 'found', message: `找到 ${relevantCount} 个相关片段（共检索 ${totalFound} 个）`, totalFound, relevantCount })}\n\n`);

      res.write(`event: status\ndata: ${JSON.stringify({ phase: 'thinking', message: '正在基于检索内容生成回答...' })}\n\n`);

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
                res.write(`event: token\ndata: ${JSON.stringify({ content, index: fullContent.length })}\n\n`);
              }
            } catch { /* skip malformed upstream event */ }
          }
        }
      }

      // Save before `done`: the frontend refetches the session immediately.
      if (fullContent) {
        await this.sessions.addMessage(sessionId, {
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
        });
        void this.sessions.logUsage({
          operation: 'KNOWLEDGE_QA',
          model: 'deepseek-v4-pro',
          tokenCount: Math.ceil((dto.question.length + fullContent.length) / 2),
          success: true,
          sessionId,
        });
      }

      res.write(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ finished: true })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      }
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  }

  @Get('reindex/status')
  getReindexStatus() {
    return this.indexing.getStatus();
  }

  @Post('reindex')
  triggerReindex() {
    return this.indexing.indexAll();
  }

  @Get('usage')
  getUsage() {
    return this.sessions.getUsageStats();
  }

  @Get('embeddings/status')
  getEmbeddingStatus() {
    return this.embeddings.getStatus();
  }

  @Post('embeddings/prepare')
  async prepareEmbeddingModel() {
    await this.embeddings.prepare();
    return this.embeddings.getStatus();
  }

  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadDocument(@UploadedFile() file: UploadedContentFile | undefined) {
    return this.ingestion.upload(file);
  }

  @Get('documents/:id/source')
  async getDocumentSource(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.knowledgeFiles.getOriginal(id);
    this.sendFile(res, file, download === '1' ? 'attachment' : 'inline');
  }

  @Get('documents/:id/preview')
  async getDocumentPreview(@Param('id') id: string, @Res() res: Response) {
    const file = await this.knowledgeFiles.getPreview(id);
    this.sendFile(res, file, 'inline');
  }

  @Get('documents/:id/local-open-path')
  getLocalOpenPath(@Param('id') id: string) {
    return this.knowledgeFiles.getLocalOpenPath(id);
  }

  // ── Folder Watch ──

  @Get('folders')
  listFolders() {
    return this.folderWatch.list();
  }

  @Get('folders/:id')
  getFolder(@Param('id') id: string) {
    return this.folderWatch.get(id);
  }

  @Post('folders')
  async startWatchingFolder(@Body() body: { folderPath: string; label?: string; spaceId?: string; recursive?: boolean }) {
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
  async stopWatchingFolder(@Param('id') id: string) {
    await this.folderWatch.stopWatching(id);
  }

  @Post('folders/:id/rescan')
  async rescanFolder(@Param('id') id: string) {
    return this.folderWatch.rescan(id);
  }

  @Sse('folders/:id/progress')
  folderProgress(@Param('id') id: string): Observable<MessageEvent> {
    return this.folderWatch.getProgressStream(id).pipe(
      map((data) => ({ data })),
    );
  }

  @Get('folders/:id/progress-snapshot')
  folderProgressSnapshot(@Param('id') id: string) {
    return this.folderWatch.getProgress(id) ?? { phase: 'done', total: 0, current: 0, currentFile: '', percent: 100 };
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
