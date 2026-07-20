import { HttpStatus, Injectable } from '@nestjs/common';
import { IntelligenceBriefKind, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { ListBriefsQueryDto, SaveBriefDto } from '../interface/http/dto/intelligence.dto';

const BRIEF_INCLUDE = { items: { orderBy: { sequence: 'asc' as const } } } satisfies Prisma.IntelligenceBriefInclude;

@Injectable()
export class IntelligenceBriefsService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async list(query: ListBriefsQueryDto) {
    const page = query.page ?? 1; const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.IntelligenceBriefWhereInput = { archivedAt: null, ...(query.kind ? { kind: query.kind } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.intelligenceBrief.findMany({ where, include: BRIEF_INCLUDE, orderBy: [{ briefDate: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.intelligenceBrief.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const brief = await this.prisma.intelligenceBrief.findFirst({ where: { id, archivedAt: null }, include: BRIEF_INCLUDE });
    if (!brief) throw this.notFound();
    return brief;
  }

  async save(dto: SaveBriefDto) {
    this.assertUniqueItems(dto.itemIds);
    const briefDate = this.utcDate(dto.briefDate);
    const briefId = await this.prisma.$transaction(async (tx) => {
      const cards = await this.loadCards(tx, dto.itemIds);
      const brief = await tx.intelligenceBrief.upsert({
        where: { kind_briefDate: { kind: dto.kind, briefDate } },
        create: { kind: dto.kind, briefDate, title: dto.title?.trim() || this.defaultTitle(dto.kind, dto.briefDate), introduction: dto.introduction },
        update: { title: dto.title?.trim() || this.defaultTitle(dto.kind, dto.briefDate), introduction: dto.introduction, archivedAt: null },
      });
      await this.replaceItems(tx, brief.id, dto.itemIds, cards);
      return brief.id;
    });
    return this.get(briefId);
  }

  async update(id: string, dto: SaveBriefDto) {
    this.assertUniqueItems(dto.itemIds);
    const briefDate = this.utcDate(dto.briefDate);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.intelligenceBrief.findFirst({
        where: { id, archivedAt: null },
        select: { id: true },
      });
      if (!current) throw this.notFound();
      const collision = await tx.intelligenceBrief.findUnique({
        where: { kind_briefDate: { kind: dto.kind, briefDate } },
        select: { id: true },
      });
      if (collision && collision.id !== id) {
        throw this.invalid('A brief already exists for this kind and date');
      }
      const cards = await this.loadCards(tx, dto.itemIds);
      await tx.intelligenceBrief.update({
        where: { id },
        data: {
          kind: dto.kind,
          briefDate,
          title: dto.title?.trim() || this.defaultTitle(dto.kind, dto.briefDate),
          introduction: dto.introduction,
        },
      });
      await this.replaceItems(tx, id, dto.itemIds, cards);
    });
    return this.get(id);
  }

  async archive(id: string): Promise<void> {
    const result = await this.prisma.intelligenceBrief.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
    if (!result.count) throw this.notFound();
  }

  private assertUniqueItems(itemIds: string[]) {
    if (new Set(itemIds).size !== itemIds.length) {
      throw this.invalid('Brief item ids must be unique');
    }
  }

  private async loadCards(tx: Prisma.TransactionClient, itemIds: string[]) {
    const cards = await tx.intelligenceItem.findMany({
      where: { id: { in: itemIds }, archivedAt: null },
      select: { id: true, title: true, summary: true, priority: true, publishedAt: true, canonicalUrl: true, occurrences: { select: { source: { select: { name: true } } } } },
    });
    if (cards.length !== itemIds.length) throw this.invalid('One or more brief items are unavailable');
    return cards;
  }

  private async replaceItems(
    tx: Prisma.TransactionClient,
    briefId: string,
    itemIds: string[],
    cards: Awaited<ReturnType<IntelligenceBriefsService['loadCards']>>,
  ) {
    await tx.intelligenceBriefItem.deleteMany({ where: { briefId } });
    const byId = new Map(cards.map((card) => [card.id, card]));
    if (itemIds.length) await tx.intelligenceBriefItem.createMany({ data: itemIds.map((itemId, sequence) => {
      const card = byId.get(itemId)!;
      return { briefId, itemId, sequence, snapshot: {
        title: card.title, summary: card.summary, priority: card.priority,
        publishedAt: card.publishedAt?.toISOString() ?? null, canonicalUrl: card.canonicalUrl,
        sourceNames: [...new Set(card.occurrences.map(({ source }) => source.name))],
      } };
    }) });
  }

  private utcDate(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw this.invalid('Brief date is invalid');
    return parsed;
  }
  private defaultTitle(kind: IntelligenceBriefKind, date: string) { return `${date} 行业情报${kind === IntelligenceBriefKind.DAILY ? '日报' : '周报'}`; }
  private notFound() { return new AppError({ code: ErrorCodes.INTELLIGENCE_BRIEF_NOT_FOUND, message: 'Intelligence brief not found', statusCode: HttpStatus.NOT_FOUND }); }
  private invalid(message: string) { return new AppError({ code: ErrorCodes.INTELLIGENCE_BRIEF_INVALID, message, statusCode: HttpStatus.UNPROCESSABLE_ENTITY }); }
}
