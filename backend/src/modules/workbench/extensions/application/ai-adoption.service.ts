import { HttpStatus, Injectable } from '@nestjs/common';
import { ContentDocumentType } from '@prisma/client';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { DocumentsService } from '../../content/application/documents.service';
import { MeetingsService } from '../../management/application/meetings.service';
import { AdoptAiDto } from '../interface/http/dto/extensions.dto';
import { AiContextService } from './ai-context.service';
import { canonicalHash } from '../domain/external-sync';

@Injectable()
export class AiAdoptionService {
  constructor(
    private readonly ai: AiContextService,
    private readonly documents: DocumentsService,
    private readonly meetings: MeetingsService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  async adopt(dto: AdoptAiDto) {
    await this.assertCompletedRun(dto);
    const output = this.ai.validateOutput(dto.citationIds, dto.output);
    const summary = output.summary ?? output.answer;
    if (dto.operation === 'AI_SUMMARIZE_MEETING') {
      if (!dto.objectId) throw this.invalid('Meeting id is required for adoption');
      const meeting = await this.meetings.get(dto.objectId);
      return this.meetings.update(dto.objectId, {
        title: meeting.title,
        scheduledAt: meeting.scheduledAt.toISOString(),
        minutes: summary,
      });
    }
    if (dto.operation === 'AI_SUMMARIZE_DOCUMENT') {
      if (!dto.objectId) throw this.invalid('Document id is required for adoption');
      const document = await this.documents.get(dto.objectId);
      const block = `AI 摘要\n${summary}`;
      if (document.plainText.includes(block)) return document;
      const separator = document.plainText.trim() ? '\n\n' : '';
      return this.documents.update(dto.objectId, {
        plainText: `${document.plainText}${separator}${block}`,
      });
    }
    return this.documents.create({
      type: ContentDocumentType.KNOWLEDGE_PAGE,
      title: dto.title ?? 'AI 知识问答',
      plainText: output.answer,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: output.answer }] }],
      },
      tags: ['AI采纳'],
      spaceId: dto.spaceId,
    });
  }

  private async assertCompletedRun(dto: AdoptAiDto) {
    const run = await this.prisma.extensionRun.findUnique({
      where: { id: dto.runId },
      include: { profile: { select: { kind: true } } },
    });
    const metadata = run?.metadata && typeof run.metadata === 'object' && !Array.isArray(run.metadata)
      ? run.metadata as Record<string, unknown>
      : {};
    const objectIds = Array.isArray(metadata.objectIds)
      ? metadata.objectIds.filter((item): item is string => typeof item === 'string')
      : [];
    const citationIds = Array.isArray(metadata.citationIds)
      ? metadata.citationIds.filter((item): item is string => typeof item === 'string')
      : [];
    const citationsMatch = citationIds.length === dto.citationIds.length
      && citationIds.every((citation, index) => citation === dto.citationIds[index]);
    const objectMatches = dto.operation === 'AI_KNOWLEDGE_QA'
      ? !dto.objectId
      : Boolean(dto.objectId && objectIds.includes(dto.objectId));
    if (
      !run
      || run.profile.kind !== 'AI'
      || run.status !== 'SUCCEEDED'
      || run.operation !== dto.operation
      || run.outputSha256 !== canonicalHash(dto.output)
      || !citationsMatch
      || !objectMatches
    ) {
      throw this.invalid('AI adoption must match the exact completed run, object and citation allowlist');
    }
  }

  private invalid(message: string) {
    return new AppError({ code: ErrorCodes.AI_OUTPUT_INVALID, message, statusCode: HttpStatus.BAD_REQUEST });
  }
}
