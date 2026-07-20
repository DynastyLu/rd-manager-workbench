import { HttpStatus, Injectable } from '@nestjs/common';
import {
  IntelligenceRunStatus,
  IntelligenceRunTrigger,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  ListRunsQueryDto,
  RecordManualRunDto,
} from '../interface/http/dto/intelligence.dto';
import { IntelligenceItemsService } from './intelligence-items.service';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

const RUN_INCLUDE = {
  plan: {
    select: {
      id: true,
      name: true,
      sourceId: true,
      source: { select: { id: true, name: true, kind: true } },
    },
  },
} satisfies Prisma.IntelligenceRunInclude;

@Injectable()
export class IntelligenceRunsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly items: IntelligenceItemsService,
  ) {}

  async list(query: ListRunsQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new AppError({
        code: ErrorCodes.INTELLIGENCE_RUN_INVALID,
        message: 'Run date range is invalid',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
    const where: Prisma.IntelligenceRunWhereInput = {
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.sourceId ? { plan: { sourceId: query.sourceId } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            startedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.intelligenceRun.findMany({
        where,
        include: RUN_INCLUDE,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.intelligenceRun.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async recordManualRun(planId: string, dto: RecordManualRunDto) {
    this.assertOutcome(dto);
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    const finishedAt = dto.finishedAt ? new Date(dto.finishedAt) : new Date();
    if (finishedAt < startedAt) {
      throw new AppError({
        code: ErrorCodes.INTELLIGENCE_RUN_INVALID,
        message: 'Run finish time cannot be earlier than start time',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.intelligenceCollectionPlan.findFirst({
        where: { id: planId, archivedAt: null, enabled: true, source: { archivedAt: null } },
        select: { id: true, sourceId: true },
      });
      if (!plan) {
        throw new AppError({
          code: ErrorCodes.INTELLIGENCE_INVALID_PLAN,
          message: 'Collection plan is archived, disabled, or unavailable',
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        });
      }
      for (const item of dto.items ?? []) {
        await this.items.ingestInTransaction(tx, { ...item, sourceId: plan.sourceId });
      }
      const run = await tx.intelligenceRun.create({
        data: {
          planId,
          trigger: IntelligenceRunTrigger.MANUAL,
          status: dto.status,
          startedAt,
          finishedAt,
          itemCount: dto.items ? dto.items.length : dto.itemCount ?? 0,
          inputSummary: dto.inputSummary,
          errorCode: dto.status === IntelligenceRunStatus.FAILED ? dto.errorCode : null,
          errorMessage: dto.status === IntelligenceRunStatus.FAILED ? dto.errorMessage : null,
        },
        include: RUN_INCLUDE,
      });
      await tx.intelligenceCollectionPlan.update({
        where: { id: planId },
        data: { lastRunAt: finishedAt },
      });
      return run;
    });
  }

  private assertOutcome(dto: RecordManualRunDto): void {
    const hasError = Boolean(dto.errorMessage?.trim());
    const failed = dto.status === IntelligenceRunStatus.FAILED;
    const failedWithItems = failed && Boolean(dto.items?.length);
    if ((failed && !hasError) || (!failed && (hasError || dto.errorCode)) || failedWithItems) {
      throw new AppError({
        code: ErrorCodes.INTELLIGENCE_RUN_INVALID,
        message: failed
          ? failedWithItems
            ? 'Failed runs cannot ingest collected items'
            : 'Failed runs require an error message'
          : 'Successful runs cannot contain error details',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }
}
