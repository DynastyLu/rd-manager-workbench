import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SessionService } from '../../application/session.service';
import { RagService } from '../../application/rag.service';
import { IndexingService } from '../../application/indexing.service';
import { DocumentImportService } from '../../application/document-import.service';
import { UploadedContentFile } from '../../../content/application/files.service';
import { CreateSessionDto, ChatMessageDto } from './dto/knowledge.dto';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly sessions: SessionService,
    private readonly rag: RagService,
    private readonly indexing: IndexingService,
    private readonly importer: DocumentImportService,
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
    await this.sessions.addMessage(sessionId, { role: 'USER', content: dto.question });
    const history = await this.sessions.getHistory(sessionId);

    const { stream, citations } = await this.rag.ask({
      question: dto.question,
      history: history.slice(0, -1),
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
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
            } catch { /* skip */ }
          }
        }
      }
    } finally {
      res.write(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ finished: true })}\n\n`);
      res.end();

      await this.sessions.addMessage(sessionId, {
        role: 'ASSISTANT',
        content: fullContent,
        citations: citations.map((c) => ({ documentId: c.documentId, title: c.title, chunkIndex: c.chunkIndex, text: c.text })),
        tokenCount: Math.ceil(fullContent.length / 2),
      });
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

  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadDocument(@UploadedFile() file: UploadedContentFile | undefined) {
    if (!file) throw new Error('File is required');
    const extracted = await this.importer.extract(file);
    return {
      title: extracted.title,
      plainTextPreview: extracted.plainText.slice(0, 500),
      plainText: extracted.plainText,
      wordCount: extracted.wordCount,
    };
  }
}
