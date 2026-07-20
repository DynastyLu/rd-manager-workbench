import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { CreateItemDto, ListItemsQueryDto, UpdateItemDto } from '../interface/http/dto/intelligence.dto';

const ITEM_INCLUDE = {
  occurrences: { include: { source: { select: { id: true, name: true, kind: true } } }, orderBy: { capturedAt: 'desc' as const } },
  topics: { include: { topic: { select: { id: true, name: true } } } },
  projects: { include: { project: { select: { id: true, code: true, name: true, status: true } } } },
  conversions: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.IntelligenceItemInclude;

function normalizedText(value?: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeCanonicalUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.hostname = url.hostname.toLocaleLowerCase('en-US');
    const entries = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
    url.search = '';
    for (const [key, itemValue] of entries) url.searchParams.append(key, itemValue);
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function buildIntelligenceContentHash(input: { canonicalUrl?: string | null; title: string; summary?: string | null; publishedAt?: string | Date | null }): string {
  const canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl);
  const basis = canonicalUrl
    ? `url\n${canonicalUrl}`
    : `content\n${normalizedText(input.title)}\n${normalizedText(input.summary)}\n${input.publishedAt ? new Date(input.publishedAt).toISOString().slice(0, 10) : ''}`;
  return createHash('sha256').update(basis).digest('hex');
}

@Injectable()
export class IntelligenceItemsService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async list(query: ListItemsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    if (query.publishedFrom && query.publishedTo && new Date(query.publishedFrom) > new Date(query.publishedTo)) throw this.invalid('Published date range is invalid');
    const where: Prisma.IntelligenceItemWhereInput = {
      archivedAt: null,
      ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { summary: { contains: query.q, mode: 'insensitive' } }, { impact: { contains: query.q, mode: 'insensitive' } }, { recommendation: { contains: query.q, mode: 'insensitive' } }] } : {}),
      ...(query.topicId ? { topics: { some: { topicId: query.topicId } } } : {}),
      ...(query.projectId ? { projects: { some: { projectId: query.projectId } } } : {}),
      ...(query.sourceId ? { occurrences: { some: { sourceId: query.sourceId } } } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.publishedFrom || query.publishedTo ? { publishedAt: { ...(query.publishedFrom ? { gte: new Date(query.publishedFrom) } : {}), ...(query.publishedTo ? { lte: new Date(query.publishedTo) } : {}) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.intelligenceItem.findMany({ where, include: ITEM_INCLUDE, orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.intelligenceItem.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const item = await this.prisma.intelligenceItem.findFirst({ where: { id, archivedAt: null }, include: ITEM_INCLUDE });
    if (!item) throw this.notFound();
    return item;
  }

  async create(dto: CreateItemDto) {
    const result = await this.prisma.$transaction((tx) => this.ingestInTransaction(tx, dto));
    return { ...result, item: await this.get(result.itemId) };
  }

  async ingestInTransaction(tx: Prisma.TransactionClient, dto: CreateItemDto) {
    const contentHash = buildIntelligenceContentHash(dto);
    const canonicalUrl = normalizeCanonicalUrl(dto.canonicalUrl);
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:intelligence-item:${contentHash}`}))`,
    );
    await this.assertReferences(tx, dto.sourceId, dto.topicIds ?? [], dto.projectIds ?? []);
    const existing = await tx.intelligenceItem.findUnique({ where: { contentHash } });
    const item = existing
      ? existing.archivedAt
        ? await tx.intelligenceItem.update({ where: { id: existing.id }, data: { archivedAt: null } })
        : existing
      : await tx.intelligenceItem.create({ data: {
          title: dto.title, summary: dto.summary, impact: dto.impact, recommendation: dto.recommendation,
          canonicalUrl, publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
          priority: dto.priority, status: dto.status, contentHash,
          topics: dto.topicIds?.length ? { create: [...new Set(dto.topicIds)].map((topicId) => ({ topicId })) } : undefined,
          projects: dto.projectIds?.length ? { create: [...new Set(dto.projectIds)].map((projectId) => ({ projectId })) } : undefined,
        } });
    const sourceUrl = normalizeCanonicalUrl(dto.sourceUrl) ?? canonicalUrl ?? `manual:${contentHash}`;
    await tx.intelligenceOccurrence.upsert({
      where: { itemId_sourceId_sourceUrl: { itemId: item.id, sourceId: dto.sourceId, sourceUrl } },
      create: { itemId: item.id, sourceId: dto.sourceId, sourceUrl, rawTitle: dto.rawTitle ?? dto.title, rawSummary: dto.rawSummary ?? dto.summary },
      update: { capturedAt: new Date(), rawTitle: dto.rawTitle ?? dto.title, rawSummary: dto.rawSummary ?? dto.summary },
    });
    return { itemId: item.id, merged: Boolean(existing) };
  }

  async update(id: string, dto: UpdateItemDto) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.intelligenceItem.findFirst({ where: { id, archivedAt: null } });
      if (!current) throw this.notFound();
      await this.assertItemLinks(tx, dto.topicIds ?? [], dto.projectIds ?? [], dto.topicIds !== undefined, dto.projectIds !== undefined);
      const canonicalUrl = dto.canonicalUrl !== undefined
        ? normalizeCanonicalUrl(dto.canonicalUrl)
        : current.canonicalUrl;
      const contentHash = buildIntelligenceContentHash({
        title: dto.title ?? current.title,
        summary: dto.summary !== undefined ? dto.summary : current.summary,
        canonicalUrl,
        publishedAt: dto.publishedAt !== undefined ? dto.publishedAt : current.publishedAt,
      });
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:intelligence-item:${contentHash}`}))`,
      );
      const collision = await tx.intelligenceItem.findUnique({ where: { contentHash } });
      if (collision && collision.id !== id) {
        throw this.invalid('Another intelligence item already has the same URL or content identity');
      }
      await tx.intelligenceItem.update({ where: { id }, data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}), ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.impact !== undefined ? { impact: dto.impact } : {}), ...(dto.recommendation !== undefined ? { recommendation: dto.recommendation } : {}),
        ...(dto.canonicalUrl !== undefined ? { canonicalUrl } : {}),
        ...(dto.publishedAt !== undefined ? { publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}),
        contentHash,
        ...(dto.topicIds !== undefined ? { topics: { deleteMany: {}, ...(dto.topicIds.length ? { create: [...new Set(dto.topicIds)].map((topicId) => ({ topicId })) } : {}) } } : {}),
        ...(dto.projectIds !== undefined ? { projects: { deleteMany: {}, ...(dto.projectIds.length ? { create: [...new Set(dto.projectIds)].map((projectId) => ({ projectId })) } : {}) } } : {}),
      } });
    });
    return this.get(id);
  }

  async archive(id: string): Promise<void> {
    const result = await this.prisma.intelligenceItem.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
    if (!result.count) throw this.notFound();
  }

  private async assertReferences(tx: Prisma.TransactionClient, sourceId: string, topicIds: string[], projectIds: string[]) {
    const source = await tx.intelligenceSource.findFirst({ where: { id: sourceId, archivedAt: null }, select: { id: true } });
    if (!source) throw this.invalid('Source is unavailable');
    await this.assertItemLinks(tx, topicIds, projectIds, true, true);
  }
  private async assertItemLinks(tx: Prisma.TransactionClient, topicIds: string[], projectIds: string[], checkTopics: boolean, checkProjects: boolean) {
    if (checkTopics && topicIds.length) {
      const count = await tx.intelligenceTopic.count({ where: { id: { in: [...new Set(topicIds)] }, archivedAt: null } });
      if (count !== new Set(topicIds).size) throw this.invalid('One or more topics are unavailable');
    }
    if (checkProjects && projectIds.length) {
      const count = await tx.project.count({ where: { id: { in: [...new Set(projectIds)] }, archivedAt: null } });
      if (count !== new Set(projectIds).size) throw this.invalid('One or more projects are unavailable');
    }
  }
  private notFound() { return new AppError({ code: ErrorCodes.INTELLIGENCE_ITEM_NOT_FOUND, message: 'Intelligence item not found', statusCode: HttpStatus.NOT_FOUND }); }
  private invalid(message: string) { return new AppError({ code: ErrorCodes.INTELLIGENCE_ITEM_INVALID, message, statusCode: HttpStatus.UNPROCESSABLE_ENTITY }); }
}
