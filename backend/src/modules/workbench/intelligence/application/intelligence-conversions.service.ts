import { HttpStatus, Injectable } from '@nestjs/common';
import { ContentDocumentType, IntelligenceConversionKind, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { DocumentsService } from '../../content/application/documents.service';
import { MeetingsService } from '../../management/application/meetings.service';
import { RisksService } from '../../management/application/risks.service';
import { TasksService } from '../../tasks/application/tasks.service';
import { ConvertItemToKnowledgePageDto, ConvertItemToMeetingAgendaDto, ConvertItemToRiskDto, ConvertItemToTaskDto } from '../interface/http/dto/intelligence.dto';

@Injectable()
export class IntelligenceConversionsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly tasks: TasksService,
    private readonly risks: RisksService,
    private readonly meetings: MeetingsService,
    private readonly documents: DocumentsService,
  ) {}

  toTask(itemId: string, dto: ConvertItemToTaskDto) {
    return this.convert(itemId, IntelligenceConversionKind.TASK, (tx, item) => this.tasks.createTaskInTransaction(tx, {
      ...dto, description: dto.description ?? this.sourceDescription(item), sourceType: 'INTELLIGENCE_ITEM', sourceId: item.id,
    }));
  }

  toRisk(itemId: string, dto: ConvertItemToRiskDto) {
    return this.convert(itemId, IntelligenceConversionKind.RISK, (tx, item) => this.risks.createRiskInTransaction(tx, {
      ...dto, description: dto.description ?? this.sourceDescription(item),
    }));
  }

  toMeetingAgenda(itemId: string, dto: ConvertItemToMeetingAgendaDto) {
    return this.convert(itemId, IntelligenceConversionKind.MEETING, (tx, item) => this.meetings.createIntelligenceAgendaInTransaction(tx, dto.meetingId, {
      title: dto.title, description: dto.description ?? this.sourceDescription(item),
    }));
  }

  toKnowledgePage(itemId: string, dto: ConvertItemToKnowledgePageDto) {
    return this.convert(itemId, IntelligenceConversionKind.KNOWLEDGE, (tx, item) => this.documents.createKnowledgePageInTransaction(tx, {
      type: ContentDocumentType.KNOWLEDGE_PAGE, title: dto.title,
      plainText: dto.plainText ?? [item.summary, item.canonicalUrl ? `来源：${item.canonicalUrl}` : null].filter(Boolean).join('\n\n'),
      projectId: dto.projectId, spaceId: dto.spaceId,
    }));
  }

  private async convert(
    itemId: string,
    kind: IntelligenceConversionKind,
    createTarget: (tx: Prisma.TransactionClient, item: { id: string; title: string; summary: string | null; canonicalUrl: string | null }) => Promise<{ id: string }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:intelligence-conversion:${itemId}:${kind}`}))`);
      const item = await tx.intelligenceItem.findFirst({ where: { id: itemId, archivedAt: null }, select: { id: true, title: true, summary: true, canonicalUrl: true } });
      if (!item) throw new AppError({ code: ErrorCodes.INTELLIGENCE_ITEM_NOT_FOUND, message: 'Intelligence item not found', statusCode: HttpStatus.NOT_FOUND });
      const existing = await tx.intelligenceConversion.findUnique({ where: { itemId_kind: { itemId, kind } } });
      if (existing) return { kind, targetId: existing.targetId, alreadyExists: true };
      const target = await createTarget(tx, item);
      await tx.intelligenceConversion.create({ data: { itemId, kind, targetId: target.id } });
      return { kind, targetId: target.id, target, alreadyExists: false };
    });
  }

  private sourceDescription(item: { id: string; summary: string | null; canonicalUrl: string | null }): string {
    return [item.summary, `情报来源：${item.id}`, item.canonicalUrl].filter(Boolean).join('\n\n');
  }
}
