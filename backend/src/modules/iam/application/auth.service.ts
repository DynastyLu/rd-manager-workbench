import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserStatus } from '@prisma/client';
import { AppEnv } from '../../../infrastructure/config/env.schema';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';
import {
  AuthenticatedPrincipal,
  IssuedSession,
  PrincipalPermission,
  SessionMeta,
} from '../domain/principal';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const LOCK_DURATION_MS = 15 * 60_000;
const MAX_FAILED_LOGINS = 5;
const AUTH_USER_INCLUDE = {
  resourceProfile: {
    select: {
      id: true,
      displayName: true,
      department: true,
      roleTitle: true,
      employmentStatus: true,
      archivedAt: true,
    },
  },
  userRoles: {
    where: { role: { isEnabled: true } },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type AuthUser = Prisma.UserGetPayload<{ include: typeof AUTH_USER_INCLUDE }>;

export interface LoginInput {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthenticationResult {
  accessToken: string;
  csrfToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: ReturnType<AuthService['currentUser']>;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  private dummyPasswordHash?: Promise<string>;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async login(input: LoginInput, meta: SessionMeta): Promise<AuthenticationResult> {
    const startedAt = Date.now();
    const identifier = input.identifier.trim();
    const normalizedUsername = identifier.toLowerCase();
    const normalizedEmployeeNo = identifier.toUpperCase();
    const matches = await this.prisma.user.findMany({
      where: {
        OR: [{ username: normalizedUsername }, { employeeNo: normalizedEmployeeNo }],
      },
      select: { id: true },
      take: 2,
    });

    if (matches.length !== 1) {
      await this.passwordService.verify(await this.getDummyPasswordHash(), input.password);
      await this.prisma.loginAudit.create({
        data: {
          username: normalizedUsername,
          eventType: 'LOGIN',
          success: false,
          failureReason: 'INVALID_CREDENTIALS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });
      await this.minimumLoginFailureDelay(startedAt);
      throw invalidCredentials();
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${matches[0].id}, 0))`,
      );
      let user = await transaction.user.findUnique({
        where: { id: matches[0].id },
        include: AUTH_USER_INCLUDE,
      });
      if (!user) return { kind: 'failure' as const };
      if (
        user.status === UserStatus.LOCKED &&
        user.lockedUntil &&
        user.lockedUntil.getTime() <= Date.now()
      ) {
        user = await transaction.user.update({
          where: { id: user.id },
          data: {
            status: UserStatus.ACTIVE,
            failedLoginCount: 0,
            lockedUntil: null,
          },
          include: AUTH_USER_INCLUDE,
        });
      }

      const passwordMatches = await this.passwordService.verify(user.passwordHash, input.password);
      const loginEligible = this.isLoginEligible(user);
      if (!passwordMatches || !this.canAttemptLogin(user) || !loginEligible) {
        await this.recordLoginFailure(
          transaction,
          user,
          normalizedUsername,
          meta,
          !passwordMatches && loginEligible,
        );
        return { kind: 'failure' as const };
      }

      const session = await this.tokenService.createSessionWithClient(
        transaction,
        user.id,
        input.rememberMe,
        meta,
      );
      const updated = await transaction.user.update({
        where: { id: user.id },
        data: {
          status:
            user.status === UserStatus.PENDING || user.status === UserStatus.LOCKED
              ? UserStatus.ACTIVE
              : user.status,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
        include: AUTH_USER_INCLUDE,
      });
      await transaction.loginAudit.create({
        data: {
          userId: user.id,
          username: user.username,
          eventType: 'LOGIN',
          success: true,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          sessionId: session.sessionId,
        },
      });
      return {
        kind: 'success' as const,
        authentication: await this.authenticationResult(updated, session),
      };
    });

    if (result.kind === 'failure') {
      await this.minimumLoginFailureDelay(startedAt);
      throw invalidCredentials();
    }
    return result.authentication;
  }

  async refresh(
    rawRefreshToken: string,
    csrfToken: string,
    meta: SessionMeta,
  ): Promise<AuthenticationResult> {
    const session = await this.tokenService.rotate(rawRefreshToken, csrfToken, meta);
    const user = await this.findAuthUser(session.userId);
    if (!this.authenticatedActive(user)) {
      await this.tokenService.revokeAllForUser(user.id, 'ACCOUNT_UNAVAILABLE');
      throw authenticationRequired();
    }
    await this.prisma.loginAudit.create({
      data: {
        userId: user.id,
        username: user.username,
        eventType: 'REFRESH',
        success: true,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        sessionId: session.sessionId,
      },
    });
    return this.authenticationResult(user, session);
  }

  csrfToken(rawRefreshToken: string): { csrfToken: string } {
    return { csrfToken: this.tokenService.csrfTokenFor(rawRefreshToken) };
  }

  async logout(
    rawRefreshToken: string,
    csrfToken: string,
    meta: SessionMeta,
  ): Promise<void> {
    await this.tokenService.revokeRefreshToken(rawRefreshToken, csrfToken, 'LOGOUT', meta);
  }

  async authenticateBearer(authorization: string | undefined): Promise<AuthenticatedPrincipal> {
    // Task 4 verifies identity and session validity only. Task 5's global guard
    // must enforce the first-password-change gate on protected business routes.
    const token = bearerToken(authorization);
    if (!token) throw authenticationRequired();

    let claims: AuthenticatedPrincipal & {
      sub: string;
      tokenType: string;
    };
    try {
      claims = await this.jwtService.verifyAsync(token, {
        secret: this.environment('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw authenticationRequired();
    }
    if (
      claims.tokenType !== 'access' ||
      typeof claims.userId !== 'string' ||
      typeof claims.sessionId !== 'string'
    ) {
      throw authenticationRequired();
    }

    const [session, user] = await Promise.all([
      this.prisma.authSession.findUnique({
        where: { id: claims.sessionId },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          revokedAt: true,
        },
      }),
      this.findAuthUser(claims.userId),
    ]);
    if (!session || session.userId !== claims.userId) {
      throw authenticationRequired();
    }
    if (session.revokedAt) throw sessionRevoked();
    if (
      session.expiresAt.getTime() <= Date.now() ||
      !this.authenticatedActive(user) ||
      user.permissionVersion !== claims.permissionVersion
    ) {
      throw authenticationRequired();
    }
    return this.principal(user, session.id);
  }

  async me(principal: AuthenticatedPrincipal) {
    return this.currentUser(await this.findAuthUser(principal.userId));
  }

  async changePassword(
    principal: AuthenticatedPrincipal,
    currentPassword: string,
    newPassword: string,
  ) {
    const { updated, sessionsRevoked } = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${principal.userId}, 0))`,
      );
      const user = await transaction.user.findUnique({
        where: { id: principal.userId },
        include: AUTH_USER_INCLUDE,
      });
      if (!user || !this.authenticatedActive(user)) {
        throw authenticationRequired();
      }
      if (!(await this.passwordService.verify(user.passwordHash, currentPassword))) {
        throw new AppError({
          code: ErrorCodes.AUTH_CURRENT_PASSWORD_INVALID,
          message: 'Current password is invalid',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }
      const passwordHash = await this.passwordService.hash(newPassword);
      const updatedUser = await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
        include: AUTH_USER_INCLUDE,
      });
      const revoked = await transaction.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: 'PASSWORD_CHANGED',
        },
      });
      return { updated: updatedUser, sessionsRevoked: revoked.count };
    });
    return {
      passwordChanged: true,
      sessionsRevoked,
      user: this.currentUser(updated),
    };
  }

  async sessions(principal: AuthenticatedPrincipal) {
    return this.prisma.authSession.findMany({
      where: {
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(principal: AuthenticatedPrincipal, sessionId: string): Promise<void> {
    await this.tokenService.revokeSession(sessionId, principal.userId, 'USER_REVOKED');
  }

  async revokeAllSessions(principal: AuthenticatedPrincipal): Promise<{ revoked: number }> {
    return {
      revoked: await this.tokenService.revokeAllForUser(principal.userId, 'USER_REVOKED_ALL'),
    };
  }

  currentUser(user: AuthUser) {
    const principal = this.principal(user, '');
    return {
      id: user.id,
      username: user.username,
      employeeNo: user.employeeNo,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      permissionVersion: user.permissionVersion,
      resourceProfileId: user.resourceProfileId,
      displayName: user.resourceProfile.displayName,
      department: user.resourceProfile.department,
      roleTitle: user.resourceProfile.roleTitle,
      roleCodes: principal.roleCodes,
      permissions: principal.permissions,
    };
  }

  private async authenticationResult(
    user: AuthUser,
    session: IssuedSession,
  ): Promise<AuthenticationResult> {
    const principal = this.principal(user, session.sessionId);
    return {
      accessToken: await this.tokenService.issueAccessToken(principal),
      csrfToken: session.csrfToken,
      refreshToken: session.rawRefreshToken,
      refreshExpiresAt: session.expiresAt,
      user: this.currentUser(user),
      mustChangePassword: user.mustChangePassword,
    };
  }

  private principal(user: AuthUser, sessionId: string): AuthenticatedPrincipal {
    const permissions = new Map<string, PrincipalPermission>();
    for (const userRole of user.userRoles) {
      for (const grant of userRole.role.rolePermissions) {
        const candidate: PrincipalPermission = {
          code: grant.permission.code,
          dataScope: grant.dataScope,
          scopeConfig: jsonObject(grant.scopeConfig),
        };
        permissions.set(permissionGrantKey(candidate), candidate);
      }
    }
    return {
      userId: user.id,
      employeeId: user.resourceProfileId,
      username: user.username,
      sessionId,
      mustChangePassword: user.mustChangePassword,
      roleCodes: user.userRoles.map(({ role }) => role.code).sort(),
      permissions: [...permissions.values()].sort(comparePermissionGrants),
      permissionVersion: user.permissionVersion,
    };
  }

  private async findAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: AUTH_USER_INCLUDE,
    });
    if (!user) throw authenticationRequired();
    return user;
  }

  private canAttemptLogin(user: AuthUser): boolean {
    if (user.status === UserStatus.DISABLED) return false;
    if (
      user.status === UserStatus.LOCKED &&
      user.lockedUntil &&
      user.lockedUntil.getTime() > Date.now()
    ) {
      return false;
    }
    return true;
  }

  private isLoginEligible(user: AuthUser): boolean {
    return (
      (user.status === UserStatus.PENDING || user.status === UserStatus.ACTIVE) &&
      this.hasActiveEmployee(user)
    );
  }

  private authenticatedActive(user: AuthUser): boolean {
    return user.status === UserStatus.ACTIVE && this.hasActiveEmployee(user);
  }

  private hasActiveEmployee(user: AuthUser): boolean {
    return (
      user.resourceProfile.archivedAt === null && user.resourceProfile.employmentStatus !== 'LEFT'
    );
  }

  private async recordLoginFailure(
    transaction: Prisma.TransactionClient,
    user: AuthUser | null,
    attemptedIdentifier: string,
    meta: SessionMeta,
    countFailure: boolean,
  ): Promise<void> {
    let failureReason = 'INVALID_CREDENTIALS';
    if (user) {
      const lockedNow =
        user.status === UserStatus.LOCKED &&
        user.lockedUntil !== null &&
        user.lockedUntil.getTime() > Date.now();
      if (lockedNow || user.status === UserStatus.DISABLED || !countFailure) {
        failureReason = 'ACCOUNT_UNAVAILABLE';
      } else {
        if (user.status === UserStatus.LOCKED) {
          await transaction.user.update({
            where: { id: user.id },
            data: {
              status: UserStatus.ACTIVE,
              failedLoginCount: 0,
              lockedUntil: null,
            },
          });
        }
        const updated = await transaction.user.update({
          where: { id: user.id },
          data: { failedLoginCount: { increment: 1 } },
          select: { failedLoginCount: true },
        });
        if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
          failureReason = 'ACCOUNT_LOCKED';
          await transaction.user.update({
            where: { id: user.id },
            data: {
              status: UserStatus.LOCKED,
              lockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
            },
          });
        }
      }
    }
    await transaction.loginAudit.create({
      data: {
        userId: user?.id,
        username: user?.username ?? attemptedIdentifier,
        eventType: 'LOGIN',
        success: false,
        failureReason,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= this.passwordService.hash('UnknownUser123');
    return this.dummyPasswordHash;
  }

  private async minimumLoginFailureDelay(startedAt: number): Promise<void> {
    const targetDuration = 250 + randomInt(0, 26);
    const remaining = targetDuration - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  private environment<Key extends keyof AppEnv>(key: Key): AppEnv[Key] {
    const value = this.config.get(key);
    if (value === undefined) {
      throw new Error(`Missing required application configuration: ${key}`);
    }
    return value;
  }
}

function invalidCredentials(): AppError {
  return new AppError({
    code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
    message: 'Invalid credentials',
    statusCode: HttpStatus.UNAUTHORIZED,
  });
}

function authenticationRequired(): AppError {
  return new AppError({
    code: ErrorCodes.AUTH_REQUIRED,
    message: 'Authentication required',
    statusCode: HttpStatus.UNAUTHORIZED,
  });
}

function sessionRevoked(): AppError {
  return new AppError({
    code: ErrorCodes.AUTH_SESSION_REVOKED,
    message: 'Authentication session has been revoked',
    statusCode: HttpStatus.UNAUTHORIZED,
  });
}

function bearerToken(authorization: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? '');
  return match?.[1];
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function permissionGrantKey(permission: PrincipalPermission): string {
  return `${permission.code}:${permission.dataScope}:${JSON.stringify(permission.scopeConfig)}`;
}

function comparePermissionGrants(left: PrincipalPermission, right: PrincipalPermission): number {
  return (
    left.code.localeCompare(right.code) ||
    left.dataScope.localeCompare(right.dataScope) ||
    JSON.stringify(left.scopeConfig).localeCompare(JSON.stringify(right.scopeConfig))
  );
}
