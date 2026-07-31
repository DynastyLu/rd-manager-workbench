import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';
import type { AuthenticatedPrincipal } from '../domain/principal';
import { ListSecurityAuditsQueryDto } from '../interface/http/dto/users.dto';

export interface PermissionDeniedMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  async denyPermission(
    principal: AuthenticatedPrincipal,
    requiredPermissions: readonly string[],
    meta: PermissionDeniedMeta,
  ): Promise<never> {
    const normalizedPermissions = [...new Set(requiredPermissions)].sort();
    try {
      await this.recordPermissionDenied(principal, normalizedPermissions, meta);
    } catch (error) {
      this.logger.error(
        `Failed to persist a permission-denied security audit (${safeErrorName(error)})`,
      );
    }
    throw new AppError({
      code: ErrorCodes.PERMISSION_DENIED,
      message: 'Permission denied',
      statusCode: HttpStatus.FORBIDDEN,
      details: { requiredPermissions: normalizedPermissions },
    });
  }

  async recordPermissionDenied(
    principal: AuthenticatedPrincipal,
    requiredPermissions: readonly string[],
    meta: PermissionDeniedMeta,
  ): Promise<void> {
    await this.prisma.loginAudit.create({
      data: {
        userId: principal.userId,
        username: principal.username,
        eventType: 'PERMISSION_DENIED',
        success: false,
        failureReason: [...new Set(requiredPermissions)].sort().join(','),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        sessionId: principal.sessionId,
      },
    });
  }

  async list(input: ListSecurityAuditsQueryDto) {
    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;
    if (from && to && from.getTime() > to.getTime()) {
      throw new AppError({
        code: ErrorCodes.AUDIT_RANGE_INVALID,
        message: 'Audit start time must not be after end time',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    const where: Prisma.LoginAuditWhereInput = {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.username ? { username: input.username.trim() } : {}),
      ...(input.eventType ? { eventType: input.eventType.trim() } : {}),
      ...(input.success !== undefined ? { success: input.success } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const [total, audits] = await Promise.all([
      this.prisma.loginAudit.count({ where }),
      this.prisma.loginAudit.findMany({
        where,
        select: {
          id: true,
          userId: true,
          username: true,
          eventType: true,
          success: true,
          failureReason: true,
          ipAddress: true,
          userAgent: true,
          sessionId: true,
          occurredAt: true,
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return {
      data: audits,
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }
}

function safeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}
