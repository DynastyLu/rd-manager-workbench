import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmploymentStatus, Prisma, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request, { Response } from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PasswordService } from '../../../../src/modules/iam/application/password.service';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Authentication API', () => {
  jest.setTimeout(120_000);

  const prisma = new PrismaClient();
  const prefix = `TEST-IAM-AUTH-${Date.now()}`;
  const username = `${prefix}-admin`.toLowerCase();
  const employeeNo = `${prefix}-001`;
  const password = 'Enterprise123';
  const firstChangedPassword = 'Enterprise234';
  const changedPassword = 'Enterprise456';
  const alternateChangedPassword = 'Enterprise789';
  let app: INestApplication;
  let activeEmployeeId: string;
  let thirdActiveEmployeeId: string;
  let accessToken: string;
  let refreshCookie: string;
  let csrfToken: string;
  let currentPassword = password;

  beforeAll(async () => {
    await clearAuthenticationData();

    const [activeEmployee, , thirdActiveEmployee] = await Promise.all([
      prisma.resourceProfile.create({
        data: {
          displayName: `${prefix}-Active`,
          department: '研发部',
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      }),
      prisma.resourceProfile.create({
        data: {
          displayName: `${prefix}-SecondActive`,
          department: '平台部',
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      }),
      prisma.resourceProfile.create({
        data: {
          displayName: `${prefix}-OnLeave`,
          employmentStatus: EmploymentStatus.ON_LEAVE,
        },
      }),
      prisma.resourceProfile.create({
        data: {
          displayName: `${prefix}-ThirdActive`,
          department: '产品部',
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      }),
      prisma.resourceProfile.create({
        data: {
          displayName: `${prefix}-Archived`,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: new Date(),
        },
      }),
    ]);
    activeEmployeeId = activeEmployee.id;
    thirdActiveEmployeeId = thirdActiveEmployee.id;

    const { AppModule } = await import('../../../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();

    // The application bootstrap auto-creates a default administrator. Replace it
    // with the isolated test administrator so the rest of the suite keeps its
    // existing assumptions (specific username, employee number and password).
    await replaceDefaultAdministratorWithTestUser();
  });

  afterAll(async () => {
    try {
      await clearAuthenticationData();
      await prisma.resourceProfile.deleteMany({
        where: { displayName: { startsWith: prefix } },
      });
    } finally {
      await prisma.$disconnect();
      await app?.close();
    }
  });

  it('logs in with either username or employee number and requires a first password change', async () => {
    const usernameLogin = await login(username);
    expect(usernameLogin.body.data).toMatchObject({
      accessToken: expect.any(String),
      csrfToken: expect.any(String),
      mustChangePassword: true,
      user: {
        username,
        employeeNo,
        resourceProfileId: activeEmployeeId,
        roleCodes: expect.arrayContaining(['SUPER_ADMIN']),
      },
    });
    expect(readSetCookie(usernameLogin)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^rd_refresh=.+; Path=\/api\/auth;.*HttpOnly;.*SameSite=Lax/i),
      ]),
    );

    const employeeNumberLogin = await login(employeeNo);
    expect(employeeNumberLogin.body.data.user.username).toBe(username);

    accessToken = employeeNumberLogin.body.data.accessToken as string;
    csrfToken = employeeNumberLogin.body.data.csrfToken as string;
    refreshCookie = cookieHeader(employeeNumberLogin);
    expect(accessTokenClaims(usernameLogin.body.data.accessToken as string)).toMatchObject({
      mustChangePassword: true,
    });
  });

  it('allows a PENDING user with an active employee to complete first login and becomes ACTIVE', async () => {
    await prisma.user.update({
      where: { username },
      data: { status: 'PENDING' },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: currentPassword });
    const userAfter = await prisma.user.findUniqueOrThrow({ where: { username } });
    if (response.status !== 201) {
      await prisma.user.update({
        where: { username },
        data: { status: 'ACTIVE' },
      });
    }

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      status: 'ACTIVE',
      mustChangePassword: true,
    });
    expect(userAfter.status).toBe('ACTIVE');
  });

  it('rejects a login identifier that matches different users across username and employee number', async () => {
    const ambiguousUser = await prisma.user.create({
      data: {
        username: employeeNo.toLowerCase(),
        employeeNo: `${employeeNo}-AMBIGUOUS`,
        passwordHash: await app.get(PasswordService).hash(currentPassword),
        status: 'ACTIVE',
        resourceProfileId: thirdActiveEmployeeId,
      },
    });
    const sessionIdsBefore = new Set(
      (await prisma.authSession.findMany({ select: { id: true } })).map(({ id }) => id),
    );

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: employeeNo, password: currentPassword });

    const sessionIdsAfter = await prisma.authSession.findMany({ select: { id: true } });
    await prisma.authSession.deleteMany({
      where: {
        id: {
          in: sessionIdsAfter.map(({ id }) => id).filter((id) => !sessionIdsBefore.has(id)),
        },
      },
    });
    await prisma.user.delete({ where: { id: ambiguousUser.id } });
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });
    await expect(prisma.authSession.count()).resolves.toBe(sessionIdsBefore.size);
  });

  it('preserves distinct data-scope grants for the same permission code', async () => {
    const projectReadPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'project.read' },
    });
    const scopedRole = await prisma.role.create({
      data: {
        code: `${prefix}-PROJECT-SCOPE`,
        name: `${prefix} project scope`,
        rolePermissions: {
          create: {
            permissionId: projectReadPermission.id,
            dataScope: 'PROJECT',
            scopeConfig: { projectIds: ['project-a'] },
          },
        },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { username } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: scopedRole.id, assignedByUserId: user.id },
    });

    const scopedLogin = await login(username);
    expect(
      scopedLogin.body.data.user.permissions.filter(
        (permission: { code: string }) => permission.code === 'project.read',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dataScope: 'ALL', scopeConfig: null }),
        expect.objectContaining({
          dataScope: 'PROJECT',
          scopeConfig: { projectIds: ['project-a'] },
        }),
      ]),
    );
  });

  it.each([
    ['archived', { archivedAt: new Date() }],
    ['left', { employmentStatus: EmploymentStatus.LEFT }],
  ])(
    'rejects login for an %s employee without creating a session',
    async (_caseName, employeeUpdate) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { username } });
      const sessionsBefore = await prisma.authSession.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      const existingSessionIds = new Set(sessionsBefore.map(({ id }) => id));
      await prisma.resourceProfile.update({
        where: { id: activeEmployeeId },
        data: employeeUpdate,
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: username, password: currentPassword });

      const sessionsAfter = await prisma.authSession.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      await prisma.authSession.deleteMany({
        where: {
          id: {
            in: sessionsAfter.map(({ id }) => id).filter((id) => !existingSessionIds.has(id)),
          },
        },
      });
      await prisma.resourceProfile.update({
        where: { id: activeEmployeeId },
        data: {
          archivedAt: null,
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      });
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
      await expect(prisma.authSession.count({ where: { userId: user.id } })).resolves.toBe(
        sessionsBefore.length,
      );
    },
  );

  it('rotates the refresh cookie and rejects reuse of the replaced token', async () => {
    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', csrfToken)
      .expect(201);

    expect(refreshed.body.data).toMatchObject({
      accessToken: expect.any(String),
      csrfToken: expect.any(String),
      user: expect.objectContaining({ username }),
    });
    const rotatedCookie = cookieHeader(refreshed);
    expect(rotatedCookie).not.toBe(refreshCookie);

    const replayed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(replayed.status).toBe(401);
    expect(replayed.body.error.code).toBe('AUTH_REFRESH_REPLAYED');
    expectClearedRefreshCookie(replayed);

    const replacementLogin = await login(username);
    accessToken = replacementLogin.body.data.accessToken as string;
    csrfToken = replacementLogin.body.data.csrfToken as string;
    refreshCookie = cookieHeader(replacementLogin);
  });

  it('preserves cookies for CSRF failures but clears deterministic unusable sessions', async () => {
    const invalidRefresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', 'invalid-csrf');

    const invalidLogout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', 'invalid-csrf');

    const cookieLessLogout = await request(app.getHttpServer()).post('/api/auth/logout');

    await prisma.resourceProfile.update({
      where: { id: activeEmployeeId },
      data: { archivedAt: new Date() },
    });
    const inactiveRefresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', csrfToken);
    await prisma.resourceProfile.update({
      where: { id: activeEmployeeId },
      data: { archivedAt: null },
    });
    const noMatchLogout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', csrfToken);
    const replacementLogin = await login(username);
    accessToken = replacementLogin.body.data.accessToken as string;
    csrfToken = replacementLogin.body.data.csrfToken as string;
    refreshCookie = cookieHeader(replacementLogin);

    expect(invalidRefresh.status).toBe(403);
    expect(invalidRefresh.body.error.code).toBe('AUTH_CSRF_INVALID');
    expect(readSetCookie(invalidRefresh)).toEqual([]);
    expect(invalidLogout.status).toBe(403);
    expect(invalidLogout.body.error.code).toBe('AUTH_CSRF_INVALID');
    expect(readSetCookie(invalidLogout)).toEqual([]);
    expect(cookieLessLogout.status).toBe(201);
    expect(cookieLessLogout.body.data).toEqual({ loggedOut: true });
    expectClearedRefreshCookie(cookieLessLogout);
    expect(inactiveRefresh.status).toBe(401);
    expect(inactiveRefresh.body.error.code).toBe('AUTH_REQUIRED');
    expectClearedRefreshCookie(inactiveRefresh);
    expect(noMatchLogout.status).toBe(201);
    expectClearedRefreshCookie(noMatchLogout);
  });

  it('returns the CSRF token associated with the current refresh cookie', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Cookie', refreshCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ csrfToken });
      });
  });

  it('requires a verified bearer token and gates session APIs until the first password change', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .send({ currentPassword: password, newPassword: 'Enterprise456' })
      .expect(401);
    await request(app.getHttpServer()).get('/api/auth/sessions').expect(401);
    await request(app.getHttpServer()).delete('/api/auth/sessions/not-a-session').expect(401);
    await request(app.getHttpServer()).delete('/api/auth/sessions').expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ username, employeeNo });
      });

    await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
      });
    await request(app.getHttpServer())
      .delete('/api/auth/sessions/not-a-session')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
      });
    await request(app.getHttpServer())
      .delete('/api/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
      });
  });

  it('allows session management after changing the initial password and signing in again', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword, newPassword: firstChangedPassword })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          passwordChanged: true,
          user: { mustChangePassword: false },
        });
      });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AUTH_SESSION_REVOKED');
      });

    currentPassword = firstChangedPassword;
    const replacementLogin = await login(username);
    accessToken = replacementLogin.body.data.accessToken as string;
    csrfToken = replacementLogin.body.data.csrfToken as string;
    refreshCookie = cookieHeader(replacementLogin);

    await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              revokedAt: null,
            }),
          ]),
        );
      });
  });

  it('revokes a specified owned session without invalidating the caller session', async () => {
    const disposableLogin = await login(username);
    const disposableAccessToken = disposableLogin.body.data.accessToken as string;
    const disposableSessionId = accessTokenClaims(disposableAccessToken).sessionId;

    await request(app.getHttpServer())
      .delete(`/api/auth/sessions/${disposableSessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ revoked: true });
      });

    await expect(
      prisma.authSession.findUniqueOrThrow({ where: { id: disposableSessionId } }),
    ).resolves.toMatchObject({
      revokedAt: expect.any(Date),
      revokeReason: 'USER_REVOKED',
    });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${disposableAccessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('revokes all sessions and invalidates the caller access token', async () => {
    const activeBefore = await prisma.authSession.count({
      where: { user: { username }, revokedAt: null },
    });
    expect(activeBefore).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .delete('/api/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ revoked: activeBefore });
      });

    await expect(
      prisma.authSession.count({ where: { user: { username }, revokedAt: null } }),
    ).resolves.toBe(0);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    const replacementLogin = await login(username);
    accessToken = replacementLogin.body.data.accessToken as string;
    csrfToken = replacementLogin.body.data.csrfToken as string;
    refreshCookie = cookieHeader(replacementLogin);
  });

  it('allows only one concurrent old-password change and revokes every old session', async () => {
    const oldPassword = currentPassword;
    const secondLogin = await login(employeeNo);
    const secondAccessToken = secondLogin.body.data.accessToken as string;
    const activeBefore = await prisma.authSession.count({
      where: { user: { username }, revokedAt: null },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { username } });
    let releasePasswordLock!: () => void;
    let reportPasswordLockAcquired!: () => void;
    const passwordLockAcquired = new Promise<void>((resolve) => {
      reportPasswordLockAcquired = resolve;
    });
    const mayReleasePasswordLock = new Promise<void>((resolve) => {
      releasePasswordLock = resolve;
    });
    const lockTransaction = prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`,
      );
      reportPasswordLockAcquired();
      await mayReleasePasswordLock;
    });

    await passwordLockAcquired;
    const firstChange = request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: oldPassword, newPassword: changedPassword })
      .then((response) => response);
    const secondChange = request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ currentPassword: oldPassword, newPassword: alternateChangedPassword })
      .then((response) => response);
    await delay(100);
    releasePasswordLock();
    const [firstResponse, secondResponse] = await Promise.all([
      firstChange,
      secondChange,
      lockTransaction,
    ]);
    const changedUser = await prisma.user.findUniqueOrThrow({ where: { username } });
    const firstPasswordWon = await app
      .get(PasswordService)
      .verify(changedUser.passwordHash, changedPassword);
    currentPassword = firstPasswordWon ? changedPassword : alternateChangedPassword;

    await expect(
      prisma.authSession.count({ where: { user: { username }, revokedAt: null } }),
    ).resolves.toBe(0);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', csrfToken)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: oldPassword })
      .expect(401);

    const replacementLogin = await login(username);
    accessToken = replacementLogin.body.data.accessToken as string;
    csrfToken = replacementLogin.body.data.csrfToken as string;
    refreshCookie = cookieHeader(replacementLogin);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([201, 400]);
    const successResponse = firstResponse.status === 201 ? firstResponse : secondResponse;
    expect(successResponse.body.data).toEqual({
      passwordChanged: true,
      sessionsRevoked: activeBefore,
      user: expect.objectContaining({
        username,
        status: 'ACTIVE',
        mustChangePassword: false,
      }),
    });
    expect(changedUser.status).toBe('ACTIVE');
  });

  it('does not overwrite a concurrent account disable during password change', async () => {
    const userBefore = await prisma.user.findUniqueOrThrow({ where: { username } });
    let disableUser!: () => void;
    let reportDisableLockAcquired!: () => void;
    const disableLockAcquired = new Promise<void>((resolve) => {
      reportDisableLockAcquired = resolve;
    });
    const mayDisableUser = new Promise<void>((resolve) => {
      disableUser = resolve;
    });
    const disableTransaction = prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${userBefore.id}, 0))`,
      );
      reportDisableLockAcquired();
      await mayDisableUser;
      await transaction.user.update({
        where: { id: userBefore.id },
        data: { status: 'DISABLED' },
      });
    });

    await disableLockAcquired;
    const changeRequest = request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword, newPassword: 'Enterprise999' })
      .then((response) => response);
    await delay(100);
    disableUser();
    const [changeResponse] = await Promise.all([changeRequest, disableTransaction]);
    const disabledUser = await prisma.user.findUniqueOrThrow({ where: { username } });
    await prisma.user.update({
      where: { id: userBefore.id },
      data: {
        status: 'ACTIVE',
        passwordHash: userBefore.passwordHash,
      },
    });
    const replacementLogin = await login(username);
    accessToken = replacementLogin.body.data.accessToken as string;
    csrfToken = replacementLogin.body.data.csrfToken as string;
    refreshCookie = cookieHeader(replacementLogin);

    expect(changeResponse.status).toBe(401);
    expect(disabledUser.status).toBe('DISABLED');
    expect(disabledUser.passwordHash).toBe(userBefore.passwordHash);
  });

  it('revokes the refresh session on logout', async () => {
    const activeSession = await prisma.authSession.findFirstOrThrow({
      where: { user: { username }, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', refreshCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('User-Agent', 'task7-logout-agent')
      .expect(201);

    await expect(
      prisma.authSession.findUniqueOrThrow({ where: { id: activeSession.id } }),
    ).resolves.toMatchObject({
      revokedAt: expect.any(Date),
      revokeReason: 'LOGOUT',
    });
    await expect(
      prisma.loginAudit.findFirst({
        where: {
          userId: activeSession.userId,
          sessionId: activeSession.id,
          eventType: 'LOGOUT',
          success: true,
        },
        orderBy: { occurredAt: 'desc' },
      }),
    ).resolves.toMatchObject({
      username,
      userAgent: 'task7-logout-agent',
    });
  });

  it('uses the same minimum response window for known and unknown invalid credentials', async () => {
    const knownStartedAt = Date.now();
    const knownFailure = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: 'WrongPassword1' });
    const knownDuration = Date.now() - knownStartedAt;

    const unknownStartedAt = Date.now();
    const unknownIdentifier = `${prefix}-timing-unknown`;
    const unknownFailure = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: unknownIdentifier, password: 'WrongPassword1' });
    const unknownDuration = Date.now() - unknownStartedAt;

    expect(knownFailure.status).toBe(401);
    expect(unknownFailure.status).toBe(401);
    expect(knownDuration).toBeGreaterThanOrEqual(240);
    expect(unknownDuration).toBeGreaterThanOrEqual(240);
    expect(Math.abs(knownDuration - unknownDuration)).toBeLessThan(150);
    await expect(
      prisma.loginAudit.count({
        where: {
          eventType: 'LOGIN',
          success: false,
          username: { in: [username, unknownIdentifier.toLowerCase()] },
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(2);
    await prisma.user.update({
      where: { username },
      data: { failedLoginCount: 0 },
    });
  });

  it('rate-limits repeated login attempts for the same identifier', async () => {
    const rateLimitedIdentifier = `${prefix}-rate-limit-missing`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: rateLimitedIdentifier, password: 'WrongPassword1' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: rateLimitedIdentifier, password: 'WrongPassword1' })
      .expect(429);
  });

  it('does not let a concurrent successful login reset a fifth failure lock', async () => {
    const before = Date.now();
    const user = await prisma.user.update({
      where: { username },
      data: { status: 'ACTIVE', failedLoginCount: 4, lockedUntil: null },
    });
    const sessionIdsBefore = new Set(
      (
        await prisma.authSession.findMany({
          where: { userId: user.id },
          select: { id: true },
        })
      ).map(({ id }) => id),
    );
    let releaseLoginLock!: () => void;
    let reportLoginLockAcquired!: () => void;
    const loginLockAcquired = new Promise<void>((resolve) => {
      reportLoginLockAcquired = resolve;
    });
    const mayReleaseLoginLock = new Promise<void>((resolve) => {
      releaseLoginLock = resolve;
    });
    const lockTransaction = prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`,
      );
      reportLoginLockAcquired();
      await mayReleaseLoginLock;
    });

    await loginLockAcquired;
    const fifthFailure = request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: 'WrongPassword1' })
      .then((response) => response);
    await delay(5);
    const concurrentSuccess = request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: currentPassword })
      .then((response) => response);
    await delay(100);
    releaseLoginLock();
    const [failureResponse, successResponse] = await Promise.all([
      fifthFailure,
      concurrentSuccess,
      lockTransaction,
    ]);

    const sessionsAfter = await prisma.authSession.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    await prisma.authSession.deleteMany({
      where: {
        id: {
          in: sessionsAfter.map(({ id }) => id).filter((id) => !sessionIdsBefore.has(id)),
        },
      },
    });
    expect(failureResponse.status).toBe(401);
    expect(successResponse.status).toBe(401);
    expect(failureResponse.body.error).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });
    expect(successResponse.body.error).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: `${prefix}-missing`, password: 'WrongPassword1' })
      .expect(401)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        });
      });

    const lockedUser = await prisma.user.findUniqueOrThrow({ where: { username } });
    expect(lockedUser.status).toBe('LOCKED');
    expect(lockedUser.failedLoginCount).toBe(5);
    expect(lockedUser.lockedUntil?.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000 - 5_000);
    expect(lockedUser.lockedUntil?.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 5_000);

    await expect(
      prisma.loginAudit.count({
        where: {
          username,
          eventType: 'LOGIN',
          success: false,
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(5);

    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1_000) },
    });
    const unlockedLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: currentPassword });
    expect(unlockedLogin.status).toBe(201);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  async function replaceDefaultAdministratorWithTestUser(): Promise<void> {
    const defaultAdmin = await prisma.user.findFirst({
      where: { username: 'admin' },
      select: { id: true, resourceProfileId: true },
    });
    if (defaultAdmin) {
      await prisma.userRole.deleteMany({ where: { userId: defaultAdmin.id } });
      await prisma.user.delete({ where: { id: defaultAdmin.id } });
      if (defaultAdmin.resourceProfileId) {
        await prisma.resourceProfile.delete({
          where: { id: defaultAdmin.resourceProfileId },
        });
      }
    }

    const passwordHash = await app.get(PasswordService).hash(password);
    const user = await prisma.user.create({
      data: {
        username,
        employeeNo,
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: true,
        resourceProfileId: activeEmployeeId,
      },
      select: { id: true },
    });
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'SUPER_ADMIN' },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: superAdminRole.id,
        assignedByUserId: user.id,
      },
    });
  }

  async function login(identifier: string): Promise<Response> {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .set('User-Agent', `${prefix}-integration-test`)
      .send({ identifier, password: currentPassword, rememberMe: false })
      .expect(201);
  }

  function readSetCookie(response: Response): string[] {
    const value = response.headers['set-cookie'] as string[] | string | undefined;
    return Array.isArray(value) ? value : value ? [value] : [];
  }

  function cookieHeader(response: Response): string {
    const cookie = readSetCookie(response)[0];
    if (!cookie) throw new Error('Authentication response did not set a refresh cookie');
    return cookie.split(';', 1)[0];
  }

  function expectClearedRefreshCookie(response: Response): void {
    expect(readSetCookie(response)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^rd_refresh=; Path=\/api\/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax/i,
        ),
      ]),
    );
  }

  async function clearAuthenticationData(): Promise<void> {
    await prisma.workTask.updateMany({ data: { assigneeUserId: null } });
    await prisma.loginAudit.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();
  }

  function accessTokenClaims(token: string): { sessionId: string } {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
      sessionId: string;
    };
  }

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
});
