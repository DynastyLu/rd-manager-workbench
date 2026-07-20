import { HttpStatus, Injectable } from '@nestjs/common';
import {
  IntelligenceCollectionFrequency,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCode, ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreatePlanDto,
  CreateSourceDto,
  CreateTopicDto,
  ListPlansQueryDto,
  ListSourcesQueryDto,
  ListTopicsQueryDto,
  UpdatePlanDto,
  UpdateSourceDto,
  UpdateTopicDto,
} from '../interface/http/dto/intelligence.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const TOPIC_INCLUDE = {
  projects: {
    include: { project: { select: { id: true, code: true, name: true, status: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.IntelligenceTopicInclude;

const PLAN_INCLUDE = {
  source: { select: { id: true, name: true, kind: true, archivedAt: true } },
} satisfies Prisma.IntelligenceCollectionPlanInclude;

type TransactionClient = Prisma.TransactionClient | PlatformPrismaService;

export function nextIntelligenceRunAt(
  schedule: {
    frequency: IntelligenceCollectionFrequency;
    runAtLocalTime?: string | null;
    weekday?: number | null;
    enabled: boolean;
  },
  now = new Date(),
): Date | null {
  if (!schedule.enabled || schedule.frequency === IntelligenceCollectionFrequency.MANUAL || !schedule.runAtLocalTime) return null;
  const [hours, minutes] = schedule.runAtLocalTime.split(':').map(Number);
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(hours, minutes, 0, 0);
  if (schedule.frequency === IntelligenceCollectionFrequency.DAILY) {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }
  const currentWeekday = candidate.getDay() || 7;
  let days = Number(schedule.weekday) - currentWeekday;
  if (days < 0 || (days === 0 && candidate <= now)) days += 7;
  candidate.setDate(candidate.getDate() + days);
  return candidate;
}

@Injectable()
export class IntelligenceCatalogService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async listTopics(query: ListTopicsQueryDto) {
    const { page, pageSize } = this.pagination(query);
    const where: Prisma.IntelligenceTopicWhereInput = {
      archivedAt: null,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
              { description: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
              { keywords: { has: query.q } },
            ],
          }
        : {}),
      ...(query.projectId ? { projects: { some: { projectId: query.projectId } } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.intelligenceTopic.findMany({
        where,
        include: TOPIC_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.intelligenceTopic.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getTopic(id: string) {
    const topic = await this.prisma.intelligenceTopic.findFirst({
      where: { id, archivedAt: null },
      include: TOPIC_INCLUDE,
    });
    if (!topic) throw this.notFound(ErrorCodes.INTELLIGENCE_TOPIC_NOT_FOUND, 'Topic not found');
    return topic;
  }

  async createTopic(dto: CreateTopicDto) {
    try {
      const topic = await this.prisma.$transaction(async (tx) => {
        await this.assertTopicNameAvailable(tx, dto.name);
        const projectIds = await this.assertActiveProjects(tx, dto.projectIds ?? []);
        return tx.intelligenceTopic.create({
          data: {
            name: dto.name,
            description: dto.description,
            keywords: this.uniqueStrings(dto.keywords ?? []),
            ...(projectIds.length
              ? { projects: { create: projectIds.map((projectId) => ({ projectId })) } }
              : {}),
          },
        });
      });
      return this.getTopic(topic.id);
    } catch (error) {
      this.rethrowDuplicate(error, ErrorCodes.INTELLIGENCE_TOPIC_EXISTS, 'Topic already exists');
    }
  }

  async updateTopic(id: string, dto: UpdateTopicDto) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.assertActiveTopic(tx, id);
        if (dto.name !== undefined) await this.assertTopicNameAvailable(tx, dto.name, id);
        const projectIds =
          dto.projectIds === undefined
            ? undefined
            : await this.assertActiveProjects(tx, dto.projectIds);
        await tx.intelligenceTopic.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.keywords !== undefined
              ? { keywords: this.uniqueStrings(dto.keywords) }
              : {}),
            ...(projectIds !== undefined
              ? {
                  projects: {
                    deleteMany: {},
                    ...(projectIds.length
                      ? { create: projectIds.map((projectId) => ({ projectId })) }
                      : {}),
                  },
                }
              : {}),
          },
        });
      });
      return this.getTopic(id);
    } catch (error) {
      this.rethrowDuplicate(error, ErrorCodes.INTELLIGENCE_TOPIC_EXISTS, 'Topic already exists');
    }
  }

  async archiveTopic(id: string): Promise<void> {
    const result = await this.prisma.intelligenceTopic.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) throw this.notFound(ErrorCodes.INTELLIGENCE_TOPIC_NOT_FOUND, 'Topic not found');
  }

  async listSources(query: ListSourcesQueryDto) {
    const { page, pageSize } = this.pagination(query);
    const where: Prisma.IntelligenceSourceWhereInput = {
      archivedAt: null,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
              { notes: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
              { url: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
      ...(query.kind ? { kind: query.kind } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.intelligenceSource.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.intelligenceSource.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getSource(id: string) {
    const source = await this.prisma.intelligenceSource.findFirst({
      where: { id, archivedAt: null },
    });
    if (!source) {
      throw this.notFound(ErrorCodes.INTELLIGENCE_SOURCE_NOT_FOUND, 'Source not found');
    }
    return source;
  }

  async createSource(dto: CreateSourceDto) {
    try {
      await this.assertSourceNameAvailable(this.prisma, dto.name);
      return await this.prisma.intelligenceSource.create({ data: dto });
    } catch (error) {
      this.rethrowDuplicate(error, ErrorCodes.INTELLIGENCE_SOURCE_EXISTS, 'Source already exists');
    }
  }

  async updateSource(id: string, dto: UpdateSourceDto) {
    try {
      await this.assertActiveSource(this.prisma, id);
      if (dto.name !== undefined) {
        await this.assertSourceNameAvailable(this.prisma, dto.name, id);
      }
      return await this.prisma.intelligenceSource.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowDuplicate(error, ErrorCodes.INTELLIGENCE_SOURCE_EXISTS, 'Source already exists');
    }
  }

  async archiveSource(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertActiveSource(tx, id);
      const activePlans = await tx.intelligenceCollectionPlan.count({
        where: { sourceId: id, archivedAt: null },
      });
      if (activePlans > 0) {
        throw new AppError({
          code: ErrorCodes.INTELLIGENCE_SOURCE_HAS_ACTIVE_PLANS,
          message: 'Archive active collection plans first',
          statusCode: HttpStatus.CONFLICT,
          details: { activePlans },
        });
      }
      await tx.intelligenceSource.update({ where: { id }, data: { archivedAt: new Date() } });
    });
  }

  async listPlans(query: ListPlansQueryDto) {
    const { page, pageSize } = this.pagination(query);
    const where: Prisma.IntelligenceCollectionPlanWhereInput = {
      archivedAt: null,
      source: { archivedAt: null },
      ...(query.q
        ? { name: { contains: query.q, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.frequency ? { frequency: query.frequency } : {}),
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.intelligenceCollectionPlan.findMany({
        where,
        include: PLAN_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.intelligenceCollectionPlan.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getPlan(id: string) {
    const plan = await this.prisma.intelligenceCollectionPlan.findFirst({
      where: { id, archivedAt: null, source: { archivedAt: null } },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw this.notFound(ErrorCodes.INTELLIGENCE_PLAN_NOT_FOUND, 'Plan not found');
    return plan;
  }

  async createPlan(dto: CreatePlanDto) {
    this.assertPlanSchedule(dto.frequency, dto.runAtLocalTime, dto.weekday);
    await this.assertActiveSource(this.prisma, dto.sourceId);
    await this.assertPlanNameAvailable(this.prisma, dto.sourceId, dto.name);
    const enabled = dto.enabled ?? true;
    return this.prisma.intelligenceCollectionPlan.create({
      data: {
        sourceId: dto.sourceId,
        name: dto.name,
        frequency: dto.frequency,
        runAtLocalTime: dto.runAtLocalTime,
        weekday: dto.weekday,
        enabled,
        connectorProfileId: dto.connectorProfileId,
        nextRunAt: nextIntelligenceRunAt({
          frequency: dto.frequency,
          runAtLocalTime: dto.runAtLocalTime,
          weekday: dto.weekday,
          enabled,
        }),
      },
      include: PLAN_INCLUDE,
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const existing = await this.getPlan(id);
    const sourceId = dto.sourceId ?? existing.sourceId;
    await this.assertActiveSource(this.prisma, sourceId);
    const schedule = this.mergePlanSchedule(existing, dto);
    const enabled = dto.enabled ?? existing.enabled;
    this.assertPlanSchedule(schedule.frequency, schedule.runAtLocalTime, schedule.weekday);
    if (dto.name !== undefined || dto.sourceId !== undefined) {
      await this.assertPlanNameAvailable(this.prisma, sourceId, dto.name ?? existing.name, id);
    }
    return this.prisma.intelligenceCollectionPlan.update({
      where: { id },
      data: {
        ...(dto.sourceId !== undefined ? { sourceId } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.frequency !== undefined ? { frequency: schedule.frequency } : {}),
        ...(dto.frequency !== undefined || dto.runAtLocalTime !== undefined
          ? { runAtLocalTime: schedule.runAtLocalTime }
          : {}),
        ...(dto.frequency !== undefined || dto.weekday !== undefined
          ? { weekday: schedule.weekday }
          : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.connectorProfileId !== undefined
          ? { connectorProfileId: dto.connectorProfileId }
          : {}),
        nextRunAt: nextIntelligenceRunAt({ ...schedule, enabled }),
      },
      include: PLAN_INCLUDE,
    });
  }

  async archivePlan(id: string): Promise<void> {
    const result = await this.prisma.intelligenceCollectionPlan.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date(), enabled: false, nextRunAt: null },
    });
    if (!result.count) throw this.notFound(ErrorCodes.INTELLIGENCE_PLAN_NOT_FOUND, 'Plan not found');
  }

  private mergePlanSchedule(
    existing: {
      frequency: IntelligenceCollectionFrequency;
      runAtLocalTime: string | null;
      weekday: number | null;
    },
    dto: UpdatePlanDto,
  ) {
    const frequency = dto.frequency ?? existing.frequency;
    const runAtLocalTime =
      frequency === IntelligenceCollectionFrequency.MANUAL && dto.frequency !== undefined
        ? dto.runAtLocalTime ?? null
        : dto.runAtLocalTime !== undefined
          ? dto.runAtLocalTime
          : existing.runAtLocalTime;
    const weekday =
      frequency !== IntelligenceCollectionFrequency.WEEKLY && dto.frequency !== undefined
        ? dto.weekday ?? null
        : dto.weekday !== undefined
          ? dto.weekday
          : existing.weekday;
    return { frequency, runAtLocalTime, weekday };
  }

  private assertPlanSchedule(
    frequency: IntelligenceCollectionFrequency,
    runAtLocalTime?: string | null,
    weekday?: number | null,
  ): void {
    const hasTime = typeof runAtLocalTime === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(runAtLocalTime);
    const isWeekday = Number.isInteger(weekday) && Number(weekday) >= 1 && Number(weekday) <= 7;
    const valid =
      (frequency === IntelligenceCollectionFrequency.MANUAL && !runAtLocalTime && weekday == null) ||
      (frequency === IntelligenceCollectionFrequency.DAILY && hasTime && weekday == null) ||
      (frequency === IntelligenceCollectionFrequency.WEEKLY && hasTime && isWeekday);
    if (!valid) {
      throw new AppError({
        code: ErrorCodes.INTELLIGENCE_INVALID_PLAN,
        message: 'Collection plan frequency and schedule do not match',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private async assertActiveProjects(tx: TransactionClient, values: string[]): Promise<string[]> {
    const projectIds = this.uniqueStrings(values);
    if (!projectIds.length) return [];
    const projects = await tx.project.findMany({
      where: { id: { in: projectIds }, archivedAt: null },
      select: { id: true },
    });
    if (projects.length !== projectIds.length) {
      throw this.notFound(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found');
    }
    return projectIds;
  }

  private async assertActiveTopic(tx: TransactionClient, id: string): Promise<void> {
    const count = await tx.intelligenceTopic.count({ where: { id, archivedAt: null } });
    if (!count) throw this.notFound(ErrorCodes.INTELLIGENCE_TOPIC_NOT_FOUND, 'Topic not found');
  }

  private async assertActiveSource(tx: TransactionClient, id: string): Promise<void> {
    const count = await tx.intelligenceSource.count({ where: { id, archivedAt: null } });
    if (!count) {
      throw this.notFound(ErrorCodes.INTELLIGENCE_SOURCE_NOT_FOUND, 'Source not found');
    }
  }

  private async assertTopicNameAvailable(
    tx: TransactionClient,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const count = await tx.intelligenceTopic.count({
      where: {
        archivedAt: null,
        name: { equals: name, mode: Prisma.QueryMode.insensitive },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (count) {
      throw new AppError({
        code: ErrorCodes.INTELLIGENCE_TOPIC_EXISTS,
        message: 'Topic already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private async assertSourceNameAvailable(
    tx: TransactionClient,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const count = await tx.intelligenceSource.count({
      where: {
        archivedAt: null,
        name: { equals: name, mode: Prisma.QueryMode.insensitive },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (count) {
      throw new AppError({
        code: ErrorCodes.INTELLIGENCE_SOURCE_EXISTS,
        message: 'Source already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private async assertPlanNameAvailable(
    tx: TransactionClient,
    sourceId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const count = await tx.intelligenceCollectionPlan.count({
      where: {
        sourceId,
        archivedAt: null,
        name: { equals: name, mode: Prisma.QueryMode.insensitive },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (count) {
      throw new AppError({
        code: ErrorCodes.INTELLIGENCE_PLAN_EXISTS,
        message: 'Plan already exists for this source',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private pagination(query: { page?: number; pageSize?: number }) {
    return {
      page: query.page ?? DEFAULT_PAGE,
      pageSize: Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    };
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private notFound(code: ErrorCode, message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND });
  }

  private rethrowDuplicate(
    error: unknown,
    code: ErrorCode,
    message: string,
  ): never {
    if (error instanceof AppError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({ code, message, statusCode: HttpStatus.CONFLICT });
    }
    throw error;
  }
}
