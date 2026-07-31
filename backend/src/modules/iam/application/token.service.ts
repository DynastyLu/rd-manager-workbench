import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AppEnv } from '../../../infrastructure/config/env.schema';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';
import { AuthenticatedPrincipal, IssuedSession, SessionMeta } from '../domain/principal';

const AUTH_SESSION_SELECT = {
  id: true,
  userId: true,
  refreshTokenHash: true,
  tokenFamilyId: true,
  rotatedToSessionId: true,
  deviceName: true,
  userAgent: true,
  ipAddress: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  revokeReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AuthSessionSelect;

type SelectedAuthSession = Prisma.AuthSessionGetPayload<{
  select: typeof AUTH_SESSION_SELECT;
}>;

type RotationResult =
  | { kind: 'issued'; session: IssuedSession }
  | { kind: 'invalid' }
  | { kind: 'replayed' };

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async issueAccessToken(principal: AuthenticatedPrincipal): Promise<string> {
    return this.jwt.sign(
      {
        ...principal,
        sub: principal.userId,
        tokenType: 'access',
      },
      {
        secret: this.environment('JWT_ACCESS_SECRET'),
        expiresIn: this.environment('JWT_ACCESS_TTL_MINUTES') * 60,
      },
    );
  }

  async createSession(
    userId: string,
    rememberMe: boolean,
    meta: SessionMeta,
  ): Promise<IssuedSession> {
    return this.createSessionWithClient(this.prisma, userId, rememberMe, meta);
  }

  async createSessionWithClient(
    client: Pick<Prisma.TransactionClient, 'authSession'>,
    userId: string,
    rememberMe: boolean,
    meta: SessionMeta,
  ): Promise<IssuedSession> {
    const now = new Date();
    const refreshTtlDays = rememberMe
      ? this.environment('JWT_REFRESH_REMEMBER_TTL_DAYS')
      : this.environment('JWT_REFRESH_TTL_DAYS');
    const expiresAt = new Date(now.getTime() + refreshTtlDays * 86_400_000);
    const rawRefreshToken = this.newRefreshToken();
    const created = await client.authSession.create({
      data: {
        userId,
        refreshTokenHash: this.hashRefreshToken(rawRefreshToken),
        tokenFamilyId: randomUUID(),
        deviceName: meta.deviceName,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
      },
      select: AUTH_SESSION_SELECT,
    });

    return this.issuedSession(created, rawRefreshToken);
  }

  async rotate(rawToken: string, csrfToken: string, meta: SessionMeta): Promise<IssuedSession> {
    this.assertValidCsrfToken(rawToken, csrfToken);
    const refreshTokenHash = this.hashRefreshToken(rawToken);
    const now = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.authSession.findUnique({
        where: { refreshTokenHash },
        select: AUTH_SESSION_SELECT,
      });
      if (!existing) return { kind: 'invalid' } satisfies RotationResult;

      if (existing.expiresAt.getTime() <= now.getTime()) {
        await transaction.authSession.updateMany({
          where: { id: existing.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'EXPIRED' },
        });
        return { kind: 'invalid' } satisfies RotationResult;
      }

      if (this.isRotated(existing)) {
        await this.revokeFamily(transaction, existing.tokenFamilyId, now);
        return { kind: 'replayed' } satisfies RotationResult;
      }
      if (existing.revokedAt) {
        return { kind: 'invalid' } satisfies RotationResult;
      }

      const claimed = await transaction.authSession.updateMany({
        where: {
          id: existing.id,
          revokedAt: null,
          rotatedToSessionId: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          revokeReason: 'ROTATED',
          lastUsedAt: now,
        },
      });

      if (claimed.count !== 1) {
        const current = await transaction.authSession.findUnique({
          where: { refreshTokenHash },
          select: AUTH_SESSION_SELECT,
        });
        if (current && this.isRotated(current)) {
          await this.revokeFamily(transaction, current.tokenFamilyId, now);
          return { kind: 'replayed' } satisfies RotationResult;
        }
        return { kind: 'invalid' } satisfies RotationResult;
      }

      const nextRawRefreshToken = this.newRefreshToken();
      const next = await transaction.authSession.create({
        data: {
          userId: existing.userId,
          refreshTokenHash: this.hashRefreshToken(nextRawRefreshToken),
          tokenFamilyId: existing.tokenFamilyId,
          deviceName: meta.deviceName,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt: existing.expiresAt,
        },
        select: AUTH_SESSION_SELECT,
      });
      await transaction.authSession.update({
        where: { id: existing.id },
        data: { rotatedToSessionId: next.id },
      });

      return {
        kind: 'issued',
        session: this.issuedSession(next, nextRawRefreshToken),
      } satisfies RotationResult;
    });

    if (result.kind === 'issued') return result.session;
    if (result.kind === 'replayed') {
      throw new AppError({
        code: ErrorCodes.AUTH_REFRESH_REPLAYED,
        message: 'Refresh token replay detected',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }
    throw new AppError({
      code: ErrorCodes.AUTH_REFRESH_INVALID,
      message: 'Refresh token is invalid or expired',
      statusCode: HttpStatus.UNAUTHORIZED,
    });
  }

  async revokeSession(sessionId: string, actorUserId: string, reason: string): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId: actorUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    if (result.count !== 1) {
      throw new AppError({
        code: ErrorCodes.AUTH_SESSION_NOT_FOUND,
        message: 'Active session was not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return result.count;
  }

  csrfTokenFor(rawRefreshToken: string): string {
    return this.csrfToken(rawRefreshToken);
  }

  async revokeRefreshToken(
    rawRefreshToken: string,
    csrfToken: string,
    reason: string,
    meta?: SessionMeta,
  ): Promise<void> {
    this.assertValidCsrfToken(rawRefreshToken, csrfToken);
    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.authSession.findUnique({
        where: { refreshTokenHash: this.hashRefreshToken(rawRefreshToken) },
        select: {
          id: true,
          userId: true,
          revokedAt: true,
          user: { select: { username: true } },
        },
      });
      if (!session || session.revokedAt) return;

      const revoked = await transaction.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: reason,
        },
      });
      if (revoked.count !== 1) return;
      await transaction.loginAudit.create({
        data: {
          userId: session.userId,
          username: session.user.username,
          eventType: reason,
          success: true,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          sessionId: session.id,
        },
      });
    });
  }

  private issuedSession(
    session: Pick<SelectedAuthSession, 'id' | 'userId' | 'expiresAt'>,
    rawRefreshToken: string,
  ): IssuedSession {
    return {
      sessionId: session.id,
      userId: session.userId,
      rawRefreshToken,
      csrfToken: this.csrfToken(rawRefreshToken),
      expiresAt: session.expiresAt,
    };
  }

  private newRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private csrfToken(rawToken: string): string {
    return createHmac('sha256', this.environment('JWT_ACCESS_SECRET'))
      .update(`csrf:${rawToken}`)
      .digest('hex');
  }

  private assertValidCsrfToken(rawToken: string, csrfToken: string): void {
    const expected = Buffer.from(this.csrfToken(rawToken), 'hex');
    const received = /^[a-f0-9]{64}$/.test(csrfToken)
      ? Buffer.from(csrfToken, 'hex')
      : Buffer.alloc(0);
    if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
      throw new AppError({
        code: ErrorCodes.AUTH_CSRF_INVALID,
        message: 'Refresh request CSRF token is invalid',
        statusCode: HttpStatus.FORBIDDEN,
      });
    }
  }

  private isRotated(session: SelectedAuthSession): boolean {
    return session.rotatedToSessionId !== null || session.revokeReason === 'ROTATED';
  }

  private async revokeFamily(
    transaction: Prisma.TransactionClient,
    tokenFamilyId: string,
    now: Date,
  ): Promise<void> {
    await transaction.authSession.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: {
        revokedAt: now,
        revokeReason: 'REFRESH_TOKEN_REPLAY',
      },
    });
  }

  private environment<Key extends keyof AppEnv>(key: Key): AppEnv[Key] {
    const value = this.config.get(key);
    if (value === undefined) {
      throw new Error(`Missing required application configuration: ${key}`);
    }
    return value;
  }
}
