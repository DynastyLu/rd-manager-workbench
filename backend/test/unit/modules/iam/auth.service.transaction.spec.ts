import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { AppEnv } from '../../../../src/infrastructure/config/env.schema';
import { AuthService } from '../../../../src/modules/iam/application/auth.service';
import { PasswordService } from '../../../../src/modules/iam/application/password.service';
import { TokenService } from '../../../../src/modules/iam/application/token.service';
import { AuthenticatedPrincipal } from '../../../../src/modules/iam/domain/principal';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';

const principal: AuthenticatedPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'alice',
  sessionId: 'session-1',
  mustChangePassword: true,
  roleCodes: [],
  permissions: [],
  permissionVersion: 0,
};

function authUser(passwordHash: string) {
  return {
    id: 'user-1',
    username: 'alice',
    employeeNo: 'RD-001',
    passwordHash,
    status: 'ACTIVE',
    mustChangePassword: true,
    failedLoginCount: 0,
    lockedUntil: null,
    passwordChangedAt: null,
    lastLoginAt: null,
    permissionVersion: 0,
    resourceProfileId: 'employee-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceProfile: {
      id: 'employee-1',
      displayName: 'Alice',
      department: 'R&D',
      roleTitle: 'Engineer',
      employmentStatus: 'ACTIVE',
      archivedAt: null,
    },
    userRoles: [],
  };
}

describe('AuthService password-change transaction', () => {
  it('locks and re-reads the active user without changing account status', async () => {
    const transaction = {
      $executeRaw: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue(authUser('old-hash')),
        update: jest.fn().mockResolvedValue(authUser('new-hash')),
      },
      authSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(authUser('old-hash')) },
      $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const password = {
      verify: jest.fn().mockResolvedValue(true),
      hash: jest.fn().mockResolvedValue('new-hash'),
    } as unknown as PasswordService;
    const token = {
      revokeAllForUser: jest.fn(),
    } as unknown as TokenService;
    const service = new AuthService(
      prisma,
      password,
      token,
      {} as JwtService,
      {} as ConfigService<AppEnv, true>,
    );

    await expect(
      service.changePassword(principal, 'Enterprise123', 'Enterprise456'),
    ).resolves.toMatchObject({ passwordChanged: true, sessionsRevoked: 2 });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
    expect(token.revokeAllForUser).not.toHaveBeenCalled();
  });

  it.each(['user-update', 'session-revoke'] as const)(
    'rolls back both password and sessions when %s fails',
    async (failureStage) => {
      const state = { passwordHash: 'old-hash', activeSessions: 2 };
      const userUpdate = jest.fn(async () => {
        if (failureStage === 'user-update') throw new Error('user update failed');
        state.passwordHash = 'new-hash';
        return authUser('new-hash');
      });
      const sessionUpdateMany = jest.fn(async () => {
        if (failureStage === 'session-revoke') throw new Error('session revoke failed');
        state.activeSessions = 0;
        return { count: 2 };
      });
      const transaction = {
        $executeRaw: jest.fn(),
        user: {
          findUnique: jest.fn().mockResolvedValue(authUser('old-hash')),
          update: userUpdate,
        },
        authSession: { updateMany: sessionUpdateMany },
      };
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue(authUser('old-hash')),
          update: userUpdate,
        },
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) => {
            const snapshot = { ...state };
            try {
              return await callback(transaction);
            } catch (error) {
              Object.assign(state, snapshot);
              throw error;
            }
          },
        ),
      } as unknown as PlatformPrismaService;
      const password = {
        verify: jest.fn().mockResolvedValue(true),
        hash: jest.fn().mockResolvedValue('new-hash'),
      } as unknown as PasswordService;
      const token = {
        revokeAllForUser: jest.fn(async () => {
          if (failureStage === 'session-revoke') {
            throw new Error('session revoke failed');
          }
          state.activeSessions = 0;
          return 2;
        }),
      } as unknown as TokenService;
      const service = new AuthService(
        prisma,
        password,
        token,
        {} as JwtService,
        {} as ConfigService<AppEnv, true>,
      );

      await expect(
        service.changePassword(principal, 'Enterprise123', 'Enterprise456'),
      ).rejects.toThrow(
        `${failureStage === 'user-update' ? 'user update' : 'session revoke'} failed`,
      );

      expect(state).toEqual({ passwordHash: 'old-hash', activeSessions: 2 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(token.revokeAllForUser).not.toHaveBeenCalled();
      if (failureStage === 'user-update') {
        expect(sessionUpdateMany).not.toHaveBeenCalled();
      }
    },
  );
});

describe('AuthService login transaction', () => {
  it('does not leave an active session when the success audit write fails', async () => {
    const state = { activeSessions: 0, lastLoginAt: null as Date | null };
    const issuedSession = {
      sessionId: 'session-new',
      userId: 'user-1',
      rawRefreshToken: 'raw-refresh',
      csrfToken: 'csrf',
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    const transaction = {
      $executeRaw: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue(authUser('old-hash')),
        update: jest.fn(async () => {
          state.lastLoginAt = new Date();
          return authUser('old-hash');
        }),
      },
      loginAudit: {
        create: jest.fn().mockRejectedValue(new Error('audit write failed')),
      },
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(authUser('old-hash')),
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      },
      $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => {
        const snapshot = { ...state };
        try {
          return await callback(transaction);
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      }),
    } as unknown as PlatformPrismaService;
    const password = {
      verify: jest.fn().mockResolvedValue(true),
    } as unknown as PasswordService;
    const createSession = jest.fn(async () => {
      state.activeSessions += 1;
      return issuedSession;
    });
    const token = {
      createSession,
      createSessionWithClient: createSession,
    } as unknown as TokenService;
    const service = new AuthService(
      prisma,
      password,
      token,
      {} as JwtService,
      {} as ConfigService<AppEnv, true>,
    );

    await expect(
      service.login(
        {
          identifier: 'alice',
          password: 'Enterprise123',
          rememberMe: false,
        },
        { ipAddress: '127.0.0.1' },
      ),
    ).rejects.toThrow('audit write failed');

    expect(state).toEqual({ activeSessions: 0, lastLoginAt: null });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService bearer session verification', () => {
  it('distinguishes a revoked session from an invalid or expired access token', async () => {
    const prisma = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(authUser('hash')),
      },
    } as unknown as PlatformPrismaService;
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        ...principal,
        sub: principal.userId,
        tokenType: 'access',
      }),
    } as unknown as JwtService;
    const config = {
      get: jest.fn().mockReturnValue('test-secret-that-is-at-least-32-characters'),
    } as unknown as ConfigService<AppEnv, true>;
    const service = new AuthService(
      prisma,
      {} as PasswordService,
      {} as TokenService,
      jwt,
      config,
    );

    await expect(service.authenticateBearer('Bearer access-token')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_SESSION_REVOKED,
      statusCode: 401,
    });
  });

  it('uses AUTH_REQUIRED for an expired access token', async () => {
    const prisma = {
      authSession: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    } as unknown as PlatformPrismaService;
    const jwt = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt expired')),
    } as unknown as JwtService;
    const config = {
      get: jest.fn().mockReturnValue('test-secret-that-is-at-least-32-characters'),
    } as unknown as ConfigService<AppEnv, true>;
    const service = new AuthService(
      prisma,
      {} as PasswordService,
      {} as TokenService,
      jwt,
      config,
    );

    await expect(service.authenticateBearer('Bearer expired-token')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
      statusCode: 401,
    });
  });
});
