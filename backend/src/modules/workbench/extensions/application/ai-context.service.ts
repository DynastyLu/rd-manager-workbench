import { HttpStatus, Injectable } from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { PrepareAiDto } from '../interface/http/dto/extensions.dto';
import { ExtensionsService } from './extensions.service';
import { parseAiOutput } from '../domain/ai-output';

const SUMMARY_LIMIT = 40_000;
const QA_LIMIT = 50_000;
const QA_SNIPPET_LIMIT = 8;

@Injectable()
export class AiContextService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly extensions: ExtensionsService,
  ) {}

  async prepare(profileId: string, dto: PrepareAiDto) {
    const context = dto.operation === 'AI_SUMMARIZE_DOCUMENT'
      ? await this.documentSummary(dto.objectId)
      : dto.operation === 'AI_SUMMARIZE_MEETING'
        ? await this.meetingSummary(dto.objectId)
        : await this.knowledgeQuestion(dto.question);
    const prepared = await this.extensions.prepareRun(profileId, {
      operation: dto.operation,
      payload: context.payload,
    });
    return { ...prepared, payload: context.payload, disclosure: context.disclosure };
  }

  validateOutput(citationAllowlist: string[], output: unknown) {
    const parsed = parseAiOutput(citationAllowlist, output);
    if (!parsed.success && parsed.reason === 'schema') {
      throw this.invalid('AI output does not match the required schema', parsed.details);
    }
    if (!parsed.success) {
      throw this.invalid('AI output contains an unknown citation');
    }
    return parsed.data;
  }

  private async documentSummary(objectId?: string) {
    if (!objectId) throw this.invalid('Document id is required');
    const document = await this.prisma.contentDocument.findFirst({
      where: { id: objectId, status: ContentStatus.ACTIVE },
      select: { id: true, title: true, plainText: true },
    });
    if (!document) throw this.notFound('Document not found');
    const context = document.plainText.slice(0, SUMMARY_LIMIT);
    return {
      payload: {
        objectIds: [document.id],
        context,
        citationIds: [`document:${document.id}`],
        title: document.title,
      },
      disclosure: {
        providerReceives: ['document title', 'document plain text'],
        objectIds: [document.id],
        characterCount: context.length,
        truncated: document.plainText.length > context.length,
      },
    };
  }

  private async meetingSummary(objectId?: string) {
    if (!objectId) throw this.invalid('Meeting id is required');
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: objectId, archivedAt: null },
      select: {
        id: true,
        title: true,
        agenda: true,
        minutes: true,
        participantNames: true,
        agendaItems: { where: { archivedAt: null }, orderBy: { sequence: 'asc' }, select: { title: true, description: true } },
        decisions: { where: { archivedAt: null }, select: { title: true, background: true, basis: true, conclusion: true } },
      },
    });
    if (!meeting) throw this.notFound('Meeting not found');
    const full = [
      meeting.title,
      meeting.agenda ?? '',
      meeting.minutes ?? '',
      ...meeting.agendaItems.flatMap((item) => [item.title, item.description ?? '']),
      ...meeting.decisions.flatMap((item) => [item.title, item.background ?? '', item.basis ?? '', item.conclusion ?? '']),
    ].filter(Boolean).join('\n');
    const context = full.slice(0, SUMMARY_LIMIT);
    return {
      payload: {
        objectIds: [meeting.id],
        context,
        citationIds: [`meeting:${meeting.id}`],
        title: meeting.title,
      },
      disclosure: {
        providerReceives: ['meeting title', 'agenda', 'minutes', 'decisions'],
        objectIds: [meeting.id],
        characterCount: context.length,
        truncated: full.length > context.length,
      },
    };
  }

  private async knowledgeQuestion(question?: string) {
    if (!question) throw this.invalid('Knowledge question is required');
    const words = question.split(/\s+/).filter(Boolean).slice(0, 8);
    const documents = await this.prisma.contentDocument.findMany({
      where: {
        status: ContentStatus.ACTIVE,
        ...(words.length
          ? { OR: words.flatMap((word) => [
              { title: { contains: word, mode: 'insensitive' as const } },
              { plainText: { contains: word, mode: 'insensitive' as const } },
            ]) }
          : {}),
      },
      select: { id: true, title: true, plainText: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: QA_SNIPPET_LIMIT,
    });
    let remaining = QA_LIMIT;
    const snippets = documents.map((document) => {
      const text = document.plainText.slice(0, remaining);
      remaining -= text.length;
      return { citationId: `document:${document.id}`, documentId: document.id, title: document.title, text };
    }).filter((snippet) => snippet.text.length > 0);
    const characterCount = snippets.reduce((sum, snippet) => sum + snippet.text.length, 0);
    return {
      payload: {
        objectIds: snippets.map((snippet) => snippet.documentId),
        question,
        snippets,
        citationIds: snippets.map((snippet) => snippet.citationId),
      },
      disclosure: {
        providerReceives: ['question', 'selected knowledge snippets'],
        objectIds: snippets.map((snippet) => snippet.documentId),
        characterCount,
        truncated: documents.some((document, index) => document.plainText.length > (snippets[index]?.text.length ?? 0)),
      },
    };
  }

  private invalid(message: string, details?: unknown) {
    return new AppError({ code: ErrorCodes.AI_OUTPUT_INVALID, message, statusCode: HttpStatus.BAD_REQUEST, details });
  }

  private notFound(message: string) {
    return new AppError({ code: ErrorCodes.DOCUMENT_NOT_FOUND, message, statusCode: HttpStatus.NOT_FOUND });
  }
}
