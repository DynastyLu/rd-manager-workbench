import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';

const allowedMetadataKeys = new Set([
  'status',
  'previousStatus',
  'itemCount',
  'fileCount',
  'byteSize',
  'providerId',
  'objectType',
  'errorCode',
  'sha256',
  'backupKind',
  'localDate',
  'routeTemplate',
  'method',
  'periodType',
  'periodStart',
  'periodEnd',
  'totalRows',
  'validRows',
  'errorRows',
  'unresolvedRows',
]);

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditRecordInput {
  action: string;
  entityType: string;
  entityId?: string;
  outcome: AuditOutcome | keyof typeof AuditOutcome;
  changedFields: string[];
  metadata: Record<string, unknown>;
  traceId?: string;
}

export interface AuditListQuery {
  action?: string;
  entityType?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  record(input: AuditRecordInput, client: AuditClient = this.prisma) {
    const metadata = Object.fromEntries(
      Object.entries(input.metadata).filter(
        ([key, value]) => allowedMetadataKeys.has(key) && this.isSafeScalar(value),
      ),
    ) as Prisma.InputJsonObject;
    return client.auditLog.create({
      data: {
        action: input.action.slice(0, 120),
        entityType: input.entityType.slice(0, 120),
        entityId: input.entityId?.slice(0, 200),
        outcome: input.outcome,
        changedFields: [...new Set(input.changedFields.map((field) => field.slice(0, 120)))].sort(),
        metadata,
        traceId: input.traceId?.slice(0, 200),
      },
    });
  }

  async list(query: AuditListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - 366 * 86_400_000);
    if (to.getTime() < from.getTime() || to.getTime() - from.getTime() > 366 * 86_400_000) {
      throw new AppError({
        code: ErrorCodes.AUDIT_RANGE_INVALID,
        message: 'Audit query range must be valid and no longer than 366 days',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
    const where: Prisma.AuditLogWhereInput = {
      action: query.action,
      entityType: query.entityType,
      outcome: query.outcome,
      occurredAt: { gte: from, lte: to },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  private isSafeScalar(value: unknown): value is string | number | boolean | null {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return true;
    if (typeof value !== 'string') return false;
    return value.length <= 200 && !/\?|:\/\/|password|token|secret|api[_-]?key/i.test(value);
  }
}
