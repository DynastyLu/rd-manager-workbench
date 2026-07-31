import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { AppEnv } from '../../../../src/infrastructure/config/env.schema';
import { AuthenticatedPrincipal, SessionMeta } from '../../../../src/modules/iam/domain/principal';
import { TokenService } from '../../../../src/modules/iam/application/token.service';

const now = new Date('2026-07-30T08:00:00.000Z');
const sevenDaysLater = new Date('2026-08-06T08:00:00.000Z');
const thirtyDaysLater = new Date('2026-08-29T08:00:00.000Z');

const principal: AuthenticatedPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'alice',
  sessionId: 'session-1',
  mustChangePassword: true,
  roleCodes: ['EMPLOYEE'],
  permissions: [
    {
      code: 'projects.read',
      dataScope: 'INVOLVED',
      scopeConfig: null,
    },
  ],
  permissionVersion: 3,
};

const meta: SessionMeta = {
  deviceName: 'Chrome on Windows',
  userAgent: 'unit-test',
  ipAddress: '127.0.0.1',
};

type AuthSessionRow = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  rotatedToSessionId: string | null;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function session(overrides: Partial<AuthSessionRow> = {}): AuthSessionRow {
  return {
    id: 'session-old',
    userId: 'user-1',
    refreshTokenHash: 'old-hash',
    tokenFamilyId: 'family-1',
    rotatedToSessionId: null,
    deviceName: null,
    userAgent: null,
    ipAddress: null,
    expiresAt: sevenDaysLater,
    lastUsedAt: null,
    revokedAt: null,
    revokeReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fixture() {
  const authSession = {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const transactionClient = { authSession };
  const prisma = {
    authSession,
    $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
    ),
  } as unknown as PlatformPrismaService;
  const environment: Pick<
    AppEnv,
    | 'JWT_ACCESS_SECRET'
    | 'JWT_ACCESS_TTL_MINUTES'
    | 'JWT_REFRESH_TTL_DAYS'
    | 'JWT_REFRESH_REMEMBER_TTL_DAYS'
  > = {
    JWT_ACCESS_SECRET: 'unit-test-access-secret-with-at-least-32-characters',
    JWT_ACCESS_TTL_MINUTES: 15,
    JWT_REFRESH_TTL_DAYS: 7,
    JWT_REFRESH_REMEMBER_TTL_DAYS: 30,
  };
  const config = {
    get: jest.fn((key: keyof typeof environment) => environment[key]),
  } as unknown as ConfigService<AppEnv, true>;
  const jwt = new JwtService();
  const service = new TokenService(prisma, jwt, config);
  return { service, prisma, authSession, jwt, environment };
}

describe('TokenService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('issues a short-lived access token containing the authenticated principal claims', async () => {
    const { service, jwt, environment } = fixture();

    const accessToken = await service.issueAccessToken(principal);
    const claims = await jwt.verifyAsync(accessToken, {
      secret: environment.JWT_ACCESS_SECRET,
    });

    expect(claims).toMatchObject({
      sub: principal.userId,
      tokenType: 'access',
      ...principal,
    });
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it.each([
    [false, sevenDaysLater],
    [true, thirtyDaysLater],
  ])('creates a hashed refresh session with rememberMe=%s', async (rememberMe, expiresAt) => {
    const { service, authSession } = fixture();
    authSession.create.mockImplementation(async ({ data }) => ({
      ...session(),
      ...data,
      id: 'session-created',
      createdAt: now,
      updatedAt: now,
    }));

    const issued = await service.createSession('user-1', rememberMe, meta);

    expect(issued.rawRefreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.expiresAt).toEqual(expiresAt);
    expect(authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        refreshTokenHash: createHash('sha256').update(issued.rawRefreshToken).digest('hex'),
        expiresAt,
        ...meta,
      }),
      select: expect.any(Object),
    });
    expect(JSON.stringify(authSession.create.mock.calls)).not.toContain(issued.rawRefreshToken);
  });

  it('rotates a refresh token into a new row and links the old row', async () => {
    const { service, authSession } = fixture();
    const first = await createIssuedSession(service, authSession);
    const oldSession = session({
      refreshTokenHash: createHash('sha256').update(first.rawRefreshToken).digest('hex'),
    });
    authSession.findUnique.mockResolvedValue(oldSession);
    authSession.updateMany.mockResolvedValue({ count: 1 });
    authSession.create.mockImplementation(async ({ data }) => ({
      ...oldSession,
      ...data,
      id: 'session-new',
      createdAt: now,
      updatedAt: now,
    }));
    authSession.update.mockResolvedValue({
      ...oldSession,
      rotatedToSessionId: 'session-new',
    });

    const rotated = await service.rotate(first.rawRefreshToken, first.csrfToken, meta);

    expect(rotated.sessionId).toBe('session-new');
    expect(rotated.rawRefreshToken).not.toBe(first.rawRefreshToken);
    expect(rotated.expiresAt).toEqual(oldSession.expiresAt);
    expect(authSession.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: oldSession.id,
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
    expect(authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: oldSession.userId,
        tokenFamilyId: oldSession.tokenFamilyId,
        expiresAt: oldSession.expiresAt,
      }),
      select: expect.any(Object),
    });
    expect(authSession.update).toHaveBeenCalledWith({
      where: { id: oldSession.id },
      data: { rotatedToSessionId: 'session-new' },
    });
  });

  it('revokes the token family and rejects a reused rotated refresh token', async () => {
    const { service, authSession } = fixture();
    const first = await createIssuedSession(service, authSession);
    authSession.findUnique.mockResolvedValue(
      session({
        rotatedToSessionId: 'session-new',
        revokedAt: now,
        revokeReason: 'ROTATED',
      }),
    );
    authSession.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.rotate(first.rawRefreshToken, first.csrfToken, meta),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_REPLAYED' });
    expect(authSession.updateMany).toHaveBeenCalledWith({
      where: { tokenFamilyId: 'family-1', revokedAt: null },
      data: {
        revokedAt: now,
        revokeReason: 'REFRESH_TOKEN_REPLAY',
      },
    });
  });

  it('uses a conditional update so a concurrent loser revokes the family as replay', async () => {
    const { service, authSession } = fixture();
    const first = await createIssuedSession(service, authSession);
    authSession.create.mockClear();
    authSession.findUnique.mockResolvedValueOnce(session()).mockResolvedValueOnce(
      session({
        rotatedToSessionId: 'session-winner',
        revokedAt: now,
        revokeReason: 'ROTATED',
      }),
    );
    authSession.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 2 });

    await expect(
      service.rotate(first.rawRefreshToken, first.csrfToken, meta),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_REPLAYED' });

    expect(authSession.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'session-old',
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
    expect(authSession.create).not.toHaveBeenCalled();
    expect(authSession.updateMany).toHaveBeenNthCalledWith(2, {
      where: { tokenFamilyId: 'family-1', revokedAt: null },
      data: {
        revokedAt: now,
        revokeReason: 'REFRESH_TOKEN_REPLAY',
      },
    });
  });

  it('rejects a refresh request with an invalid CSRF token before database access', async () => {
    const { service, authSession } = fixture();

    await expect(service.rotate('refresh-token', 'invalid-csrf', meta)).rejects.toMatchObject({
      code: 'AUTH_CSRF_INVALID',
    });
    expect(authSession.findUnique).not.toHaveBeenCalled();
  });

  it('revokes one owned session and all active sessions for a user', async () => {
    const { service, authSession } = fixture();
    authSession.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 3 });

    await service.revokeSession('session-1', 'user-1', 'USER_LOGOUT');
    await expect(service.revokeAllForUser('user-1', 'PASSWORD_CHANGED')).resolves.toBe(3);

    expect(authSession.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'session-1', userId: 'user-1', revokedAt: null },
      data: { revokedAt: now, revokeReason: 'USER_LOGOUT' },
    });
    expect(authSession.updateMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: now, revokeReason: 'PASSWORD_CHANGED' },
    });
  });
});

async function createIssuedSession(
  service: TokenService,
  authSession: ReturnType<typeof fixture>['authSession'],
) {
  authSession.create.mockImplementationOnce(async ({ data }) => ({
    ...session(),
    ...data,
    id: 'issued-session',
    createdAt: now,
    updatedAt: now,
  }));
  return service.createSession('user-1', false, meta);
}
