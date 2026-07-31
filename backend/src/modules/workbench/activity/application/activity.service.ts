import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityActorKind,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';

type ActivityDatabaseClient = PlatformPrismaService | Prisma.TransactionClient;

export interface AppendActivityInput {
  actorKind: ActivityActorKind;
  actorId?: string | null;
  actorName?: string | null;
  objectType: string;
  objectId: string;
  projectId?: string | null;
  employeeId?: string | null;
  action: string;
  summary: string;
  sourcePath: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}

export interface ListActivityInput {
  projectId?: string;
  employeeId?: string;
  objectType?: string;
  actorKind?: ActivityActorKind;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

interface ActivityCursor {
  occurredAt: Date;
  id: string;
}

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  append(input: AppendActivityInput, client: ActivityDatabaseClient = this.prisma) {
    return client.activityRecord.create({
      data: {
        actorKind: input.actorKind,
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        objectType: this.safeToken(input.objectType, 80),
        objectId: this.safeToken(input.objectId, 160),
        projectId: input.projectId ?? null,
        employeeId: input.employeeId ?? null,
        action: this.safeToken(input.action, 80),
        summary: this.safeSummary(input.summary),
        sourcePath: this.safeSourcePath(input.sourcePath),
        metadata: input.metadata,
        occurredAt: input.occurredAt,
      },
    });
  }

  async list(input: ListActivityInput) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : null;
    const occurredAt: Prisma.DateTimeFilter = {
      ...(input.from ? { gte: new Date(input.from) } : {}),
      ...(input.to ? { lte: new Date(input.to) } : {}),
    };
    const baseWhere: Prisma.ActivityRecordWhereInput = {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.objectType ? { objectType: input.objectType } : {}),
      ...(input.actorKind ? { actorKind: input.actorKind } : {}),
      ...(input.from || input.to ? { occurredAt } : {}),
      ...(cursor
        ? {
            AND: [
              {
                OR: [
                  { occurredAt: { lt: cursor.occurredAt } },
                  { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : {}),
    };
    const data = await this.prisma.activityRecord.findMany({
      where: {
        AND: [baseWhere, this.dataScope.activities(this.principal())],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = data.length > limit;
    const page = hasMore ? data.slice(0, limit) : data;
    const last = page.at(-1);
    return {
      data: page,
      nextCursor:
        hasMore && last
          ? this.encodeCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
    };
  }

  encodeCursor(cursor: ActivityCursor): string {
    return Buffer.from(
      JSON.stringify({ occurredAt: cursor.occurredAt.toISOString(), id: cursor.id }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(value: string): ActivityCursor {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        occurredAt?: unknown;
        id?: unknown;
      };
      const occurredAt = new Date(String(parsed.occurredAt ?? ''));
      if (
        Number.isNaN(occurredAt.getTime()) ||
        typeof parsed.id !== 'string' ||
        !parsed.id
      ) {
        throw new Error('invalid cursor');
      }
      return { occurredAt, id: parsed.id };
    } catch (cause) {
      throw new AppError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Activity cursor is invalid',
        statusCode: HttpStatus.BAD_REQUEST,
        cause,
      });
    }
  }

  private safeSummary(value: string): string {
    return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 500);
  }

  private safeToken(value: string, maxLength: number): string {
    return value.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, maxLength);
  }

  private safeSourcePath(value: string): string {
    const normalized = value.trim();
    if (!normalized.startsWith('/') || normalized.startsWith('//')) {
      throw new AppError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Activity source path must be an application-relative path',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
    return normalized.slice(0, 500);
  }
}
