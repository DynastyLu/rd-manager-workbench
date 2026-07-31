import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  EmploymentStatus,
  Prisma,
  PrismaClient,
  Role,
  User,
  UserStatus,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { AuthService } from '../../../../src/modules/iam/application/auth.service';
import { PasswordService } from '../../../../src/modules/iam/application/password.service';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('administrator user APIs', () => {
  jest.setTimeout(120_000);

  const prisma = new PrismaClient();
  const prefix = `iam-user-${randomUUID()}`.toLowerCase();
  const temporaryPassword = 'Enterprise123';
  const replacementPassword = 'Enterprise456';
  const cleanupUserIds = new Set<string>();
  const cleanupEmployeeIds = new Set<string>();
  const cleanupRoleIds = new Set<string>();
  let app: INestApplication;
  let password: PasswordService;
  let auth: AuthService;
  let admin: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employee: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employeeRole: Role;

  beforeAll(async () => {
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

    password = app.get(PasswordService);
    auth = app.get(AuthService);
    admin = await authenticatedRequest(app, prisma, 'SUPER_ADMIN');
    employee = await authenticatedRequest(app, prisma, 'EMPLOYEE');
    cleanupUserIds.add(admin.user.id);
    cleanupUserIds.add(employee.user.id);
    cleanupEmployeeIds.add(admin.employee.id);
    cleanupEmployeeIds.add(employee.employee.id);
    employeeRole = employee.role;
    await prisma.role.updateMany({
      where: { code: { in: ['SUPER_ADMIN', 'EMPLOYEE'] } },
      data: { isSystem: true, isEnabled: true },
    });
  });

  afterAll(async () => {
    try {
      const userIds = [...cleanupUserIds];
      if (userIds.length > 0) {
        await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.loginAudit.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.userRole.deleteMany({
          where: {
            OR: [
              { userId: { in: userIds } },
              { assignedByUserId: { in: userIds } },
            ],
          },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.loginAudit.deleteMany({ where: { username: { startsWith: prefix } } });
      const roleIds = [...cleanupRoleIds];
      if (roleIds.length > 0) {
        await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
        await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      }
      const employeeIds = [...cleanupEmployeeIds];
      if (employeeIds.length > 0) {
        await prisma.resourceProfile.deleteMany({ where: { id: { in: employeeIds } } });
      }
    } finally {
      await prisma.$disconnect();
      await app?.close();
    }
  });

  it('requires administrator permissions for user and session administration', async () => {
    const employeeSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: employee.user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await employee.agent
      .get('/api/admin/users')
      .set('User-Agent', 'task7-permission-denied-agent')
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('PERMISSION_DENIED'));
    await expect(
      prisma.loginAudit.findFirst({
        where: {
          userId: employee.user.id,
          eventType: 'PERMISSION_DENIED',
          success: false,
          userAgent: 'task7-permission-denied-agent',
        },
        orderBy: { occurredAt: 'desc' },
      }),
    ).resolves.toMatchObject({
      username: employee.user.username,
      failureReason: 'user.read',
      sessionId: employeeSession.id,
    });
    await employee.agent
      .post('/api/admin/users')
      .send({
        resourceProfileId: employee.employee.id,
        username: `${prefix}-forbidden`,
        employeeNo: `${prefix}-forbidden-no`,
        roleIds: [employeeRole.id],
        temporaryPassword,
      })
      .expect(403);
    await employee.agent.get(`/api/admin/users/${admin.user.id}/sessions`).expect(403);
  });

  it('creates and binds an eligible employee, assigns roles, and lists paginated users', async () => {
    const employeeProfile = await createEmployee('bindable', {
      department: '任务七研发部',
    });

    const response = await admin.agent
      .post('/api/admin/users')
      .send({
        resourceProfileId: employeeProfile.id,
        username: `  ${prefix}-New-User  `,
        employeeNo: `  ${prefix}-rd-701  `,
        roleIds: [employeeRole.id],
        temporaryPassword,
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      username: `${prefix}-new-user`,
      employeeNo: `${prefix}-RD-701`.toUpperCase(),
      status: UserStatus.PENDING,
      mustChangePassword: true,
      resourceProfile: {
        id: employeeProfile.id,
        displayName: employeeProfile.displayName,
        department: '任务七研发部',
      },
      roles: [expect.objectContaining({ id: employeeRole.id, code: 'EMPLOYEE' })],
    });
    cleanupUserIds.add(response.body.data.id as string);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: response.body.data.id as string },
      include: { userRoles: true },
    });
    expect(await password.verify(stored.passwordHash, temporaryPassword)).toBe(true);
    expect(stored.userRoles).toEqual([
      expect.objectContaining({
        roleId: employeeRole.id,
        assignedByUserId: admin.user.id,
      }),
    ]);
    await expect(
      prisma.loginAudit.count({
        where: {
          userId: stored.id,
          eventType: 'USER_CREATED',
          success: true,
        },
      }),
    ).resolves.toBe(1);

    await admin.agent
      .get('/api/admin/users')
      .query({
        page: 1,
        pageSize: 1,
        search: `${prefix}-new`,
        status: UserStatus.PENDING,
        department: '任务七研发部',
        roleId: employeeRole.id,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.meta).toEqual({ page: 1, pageSize: 1, total: 1 });
        expect(body.data.data).toEqual([
          expect.objectContaining({
            id: stored.id,
            username: `${prefix}-new-user`,
          }),
        ]);
      });

    await admin.agent
      .get(`/api/admin/users/${stored.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: stored.id,
          resourceProfile: { id: employeeProfile.id },
          roles: [expect.objectContaining({ code: 'EMPLOYEE' })],
        });
        expect(body.data).not.toHaveProperty('passwordHash');
      });

    await admin.agent
      .post('/api/admin/users')
      .send({
        resourceProfileId: employeeProfile.id,
        username: `${prefix}-duplicate-binding`,
        employeeNo: `${prefix}-duplicate-binding-no`,
        roleIds: [employeeRole.id],
        temporaryPassword,
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('USER_EMPLOYEE_ALREADY_BOUND');
      });
  });

  it('supports an optional employee number and lets administrators clear it', async () => {
    const employeeProfile = await createEmployee('optional-employee-number');
    const response = await admin.agent
      .post('/api/admin/users')
      .send({
        resourceProfileId: employeeProfile.id,
        username: `${prefix}-optional-employee-number`,
        roleIds: [employeeRole.id],
        temporaryPassword,
      })
      .expect(201);
    cleanupUserIds.add(response.body.data.id as string);
    expect(response.body.data.employeeNo).toBeNull();

    await admin.agent
      .patch(`/api/admin/users/${response.body.data.id as string}`)
      .send({ employeeNo: `${prefix}-OPTIONAL-NO` })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.employeeNo).toBe(`${prefix}-OPTIONAL-NO`.toUpperCase());
      });
    await admin.agent
      .patch(`/api/admin/users/${response.body.data.id as string}`)
      .send({ employeeNo: null })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.employeeNo).toBeNull();
      });
  });

  it('serializes identifier creation globally and rejects the concurrent collision', async () => {
    const firstProfile = await createEmployee('identifier-race-first');
    const secondProfile = await createEmployee('identifier-race-second');
    const sharedUsername = `${prefix}-identifier-race`;
    let releaseLock!: () => void;
    let reportLockAcquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      reportLockAcquired = resolve;
    });
    const mayReleaseLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockTransaction = prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'iam:user-identifiers'}, 0))`,
      );
      reportLockAcquired();
      await mayReleaseLock;
    });

    await lockAcquired;
    const create = (resourceProfileId: string, employeeNo: string) =>
      admin.agent
        .post('/api/admin/users')
        .send({
          resourceProfileId,
          username: sharedUsername,
          employeeNo,
          roleIds: [employeeRole.id],
          temporaryPassword,
        })
        .then((response) => response);
    const first = create(firstProfile.id, `${prefix}-race-1`);
    const second = create(secondProfile.id, `${prefix}-race-2`);
    const state = await Promise.race([
      Promise.all([first, second]).then(() => 'resolved' as const),
      delay(250).then(() => 'pending' as const),
    ]);

    releaseLock();
    await lockTransaction;
    const responses = await Promise.all([first, second]);
    const successful = responses.find(({ status }) => status === 201);
    if (successful) cleanupUserIds.add(successful.body.data.id as string);
    expect(state).toBe('pending');
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.error.code).toBe(
      'USER_IDENTIFIER_EXISTS',
    );
    await expect(
      prisma.user.count({
        where: { username: sharedUsername },
      }),
    ).resolves.toBe(1);
  });

  it('rejects archived and departed employees before creating an account', async () => {
    const archived = await createEmployee('archived', {
      archivedAt: new Date(),
    });
    const departed = await createEmployee('departed', {
      employmentStatus: EmploymentStatus.LEFT,
    });

    for (const [resourceProfileId, suffix] of [
      [archived.id, 'archived'],
      [departed.id, 'departed'],
    ]) {
      await admin.agent
        .post('/api/admin/users')
        .send({
          resourceProfileId,
          username: `${prefix}-${suffix}`,
          employeeNo: `${prefix}-${suffix}-no`,
          roleIds: [employeeRole.id],
          temporaryPassword,
        })
        .expect(409)
        .expect(({ body }) => {
          expect(body.error.code).toBe('USER_EMPLOYEE_NOT_ELIGIBLE');
        });
    }
  });

  it('rejects normalized identifiers that collide across username and employee-number columns', async () => {
    const existing = await createUser('cross-existing', {
      username: `${prefix}-cross-name`,
      employeeNo: `${prefix}-cross-number`,
    });
    const firstProfile = await createEmployee('cross-first');
    const secondProfile = await createEmployee('cross-second');
    const updateTarget = await createUser('cross-update-target');

    await admin.agent
      .post('/api/admin/users')
      .send({
        resourceProfileId: firstProfile.id,
        username: `  ${existing.employeeNo?.toUpperCase()}  `,
        employeeNo: `${prefix}-cross-new-number`,
        roleIds: [employeeRole.id],
        temporaryPassword,
      })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('USER_IDENTIFIER_AMBIGUOUS'));

    await admin.agent
      .post('/api/admin/users')
      .send({
        resourceProfileId: secondProfile.id,
        username: `${prefix}-cross-new-name`,
        employeeNo: `  ${existing.username.toUpperCase()}  `,
        roleIds: [employeeRole.id],
        temporaryPassword,
      })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('USER_IDENTIFIER_AMBIGUOUS'));

    await admin.agent
      .patch(`/api/admin/users/${updateTarget.id}`)
      .send({ username: existing.employeeNo?.toUpperCase() })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('USER_IDENTIFIER_AMBIGUOUS'));
    await admin.agent
      .patch(`/api/admin/users/${updateTarget.id}`)
      .send({ employeeNo: existing.username.toUpperCase() })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('USER_IDENTIFIER_AMBIGUOUS'));
  });

  it('replaces role assignments atomically, increments permission version and revokes sessions', async () => {
    const target = await createUser('role-target', { mustChangePassword: false });
    const customRole = await prisma.role.create({
      data: {
        code: `${prefix}-CUSTOM-ROLE`.toUpperCase(),
        name: '任务七自定义角色',
      },
    });
    cleanupRoleIds.add(customRole.id);
    await login(target.username, 'role-before-change');
    const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

    await admin.agent
      .patch(`/api/admin/users/${target.id}`)
      .send({ roleIds: [customRole.id] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.roles).toEqual([
          expect.objectContaining({ id: customRole.id, code: customRole.code }),
        ]);
      });

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      include: { userRoles: true, authSessions: true },
    });
    expect(after.permissionVersion).toBe(before.permissionVersion + 1);
    expect(after.userRoles).toEqual([
      expect.objectContaining({
        roleId: customRole.id,
        assignedByUserId: admin.user.id,
      }),
    ]);
    expect(after.authSessions).toEqual([
      expect.objectContaining({
        revokedAt: expect.any(Date),
        revokeReason: 'ROLE_ASSIGNMENT_CHANGED',
      }),
    ]);
  });

  it('resets a temporary password and immediately revokes every existing session', async () => {
    const target = await createUser('password-target', { mustChangePassword: false });
    await login(target.username, 'password-device-a');
    await login(target.username, 'password-device-b');

    await admin.agent
      .post(`/api/admin/users/${target.id}/reset-password`)
      .send({ temporaryPassword: replacementPassword })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: target.id,
          mustChangePassword: true,
          sessionsRevoked: 2,
        });
      });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      include: { authSessions: true },
    });
    expect(await password.verify(stored.passwordHash, replacementPassword)).toBe(true);
    expect(await password.verify(stored.passwordHash, temporaryPassword)).toBe(false);
    expect(stored.passwordChangedAt).toEqual(expect.any(Date));
    expect(stored.authSessions.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
  });

  it('disables and enables an account while making old access tokens unusable', async () => {
    const target = await createUser('status-target', { mustChangePassword: false });
    const authentication = await login(target.username, 'status-device');
    const targetAgent = request
      .agent(app.getHttpServer())
      .set('Authorization', `Bearer ${authentication.accessToken}`);

    await admin.agent
      .post(`/api/admin/users/${target.id}/disable`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: target.id,
          status: UserStatus.DISABLED,
          sessionsRevoked: 1,
        });
      });
    await targetAgent.get('/api/auth/me').expect(401);

    await admin.agent
      .post(`/api/admin/users/${target.id}/enable`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: target.id,
          status: UserStatus.ACTIVE,
        });
      });
    await expect(prisma.user.findUniqueOrThrow({ where: { id: target.id } })).resolves.toMatchObject({
      status: UserStatus.ACTIVE,
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it('lists safe session metadata and can force logout from every device', async () => {
    const target = await createUser('session-target', { mustChangePassword: false });
    await login(target.username, 'task7-device-a');
    await login(target.username, 'task7-device-b');

    await admin.agent
      .get(`/api/admin/users/${target.id}/sessions`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(2);
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              deviceName: 'task7-device-a',
              revokedAt: null,
            }),
            expect.objectContaining({
              deviceName: 'task7-device-b',
              revokedAt: null,
            }),
          ]),
        );
        for (const session of body.data as Array<Record<string, unknown>>) {
          expect(session).not.toHaveProperty('refreshTokenHash');
        }
      });

    await admin.agent
      .post(`/api/admin/users/${target.id}/revoke-sessions`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ sessionsRevoked: 2 });
      });
    await expect(
      prisma.authSession.count({
        where: { userId: target.id, revokedAt: null },
      }),
    ).resolves.toBe(0);
  });

  it('serializes every user mutation with the same per-user advisory transaction lock', async () => {
    const target = await createUser('locked-target');
    let releaseLock!: () => void;
    let reportLockAcquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      reportLockAcquired = resolve;
    });
    const mayReleaseLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockTransaction = prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${target.id}, 0))`,
      );
      reportLockAcquired();
      await mayReleaseLock;
    });

    await lockAcquired;
    const mutation = admin.agent
      .patch(`/api/admin/users/${target.id}`)
      .send({ username: `${prefix}-locked-target-renamed` })
      .then((response) => response);
    const requestState = await Promise.race([
      mutation.then(() => 'resolved' as const),
      delay(250).then(() => 'pending' as const),
    ]);

    releaseLock();
    await lockTransaction;
    const response = await mutation;
    expect(requestState).toBe('pending');
    expect(response.status).toBe(200);
    expect(response.body.data.username).toBe(`${prefix}-locked-target-renamed`);
  });

  it('never disables, demotes or deletes the last active SUPER_ADMIN', async () => {
    const otherActiveAdministrators = await prisma.user.findMany({
      where: {
        id: { not: admin.user.id },
        status: UserStatus.ACTIVE,
        userRoles: { some: { role: { code: 'SUPER_ADMIN', isEnabled: true } } },
      },
      select: { id: true, status: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: otherActiveAdministrators.map(({ id }) => id) } },
      data: { status: UserStatus.DISABLED },
    });

    try {
      await admin.agent
        .post(`/api/admin/users/${admin.user.id}/disable`)
        .expect(409)
        .expect(({ body }) => expect(body.error.code).toBe('USER_LAST_SUPER_ADMIN'));
      await admin.agent
        .patch(`/api/admin/users/${admin.user.id}`)
        .send({ roleIds: [employeeRole.id] })
        .expect(409)
        .expect(({ body }) => expect(body.error.code).toBe('USER_LAST_SUPER_ADMIN'));
      await admin.agent
        .delete(`/api/admin/users/${admin.user.id}`)
        .send({ confirmNoOwnershipReferences: true })
        .expect(409)
        .expect(({ body }) => expect(body.error.code).toBe('USER_LAST_SUPER_ADMIN'));
    } finally {
      for (const otherAdministrator of otherActiveAdministrators) {
        await prisma.user.update({
          where: { id: otherAdministrator.id },
          data: { status: otherAdministrator.status },
        });
      }
    }
  });

  it('deletes an account only after disablement, session revocation and ownership confirmation', async () => {
    const target = await createUser('delete-target', { mustChangePassword: false });
    await login(target.username, 'delete-device');

    await admin.agent
      .delete(`/api/admin/users/${target.id}`)
      .send({ confirmNoOwnershipReferences: true })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('USER_DELETE_REQUIRES_DISABLED'));

    await prisma.user.update({
      where: { id: target.id },
      data: { status: UserStatus.DISABLED },
    });
    await admin.agent
      .delete(`/api/admin/users/${target.id}`)
      .send({ confirmNoOwnershipReferences: true })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('USER_DELETE_REQUIRES_SESSION_REVOCATION');
      });

    await admin.agent.post(`/api/admin/users/${target.id}/revoke-sessions`).expect(200);
    await admin.agent
      .delete(`/api/admin/users/${target.id}`)
      .send({ confirmNoOwnershipReferences: false })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('USER_OWNERSHIP_CONFIRMATION_REQUIRED');
      });

    await admin.agent
      .delete(`/api/admin/users/${target.id}`)
      .send({ confirmNoOwnershipReferences: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({
          id: target.id,
          deleted: true,
          resourceProfileId: target.resourceProfileId,
        });
      });

    cleanupUserIds.delete(target.id);
    await expect(prisma.user.findUnique({ where: { id: target.id } })).resolves.toBeNull();
    await expect(
      prisma.resourceProfile.findUnique({ where: { id: target.resourceProfileId } }),
    ).resolves.toMatchObject({ id: target.resourceProfileId });
    await expect(
      prisma.loginAudit.count({
        where: {
          username: target.username,
          eventType: 'USER_DELETED',
          success: true,
        },
      }),
    ).resolves.toBe(1);
  });

  async function createEmployee(
    suffix: string,
    overrides: {
      department?: string;
      employmentStatus?: EmploymentStatus;
      archivedAt?: Date;
    } = {},
  ) {
    const employeeProfile = await prisma.resourceProfile.create({
      data: {
        displayName: `${prefix}-${suffix}-${randomUUID()}`,
        department: overrides.department ?? '任务七测试部',
        employmentStatus: overrides.employmentStatus ?? EmploymentStatus.ACTIVE,
        archivedAt: overrides.archivedAt,
      },
    });
    cleanupEmployeeIds.add(employeeProfile.id);
    return employeeProfile;
  }

  async function createUser(
    suffix: string,
    overrides: {
      username?: string;
      employeeNo?: string;
      mustChangePassword?: boolean;
      status?: UserStatus;
      roleIds?: string[];
    } = {},
  ): Promise<User> {
    const employeeProfile = await createEmployee(suffix);
    const passwordHash = await password.hash(temporaryPassword);
    const user = await prisma.user.create({
      data: {
        username: overrides.username ?? `${prefix}-${suffix}`,
        employeeNo: overrides.employeeNo ?? `${prefix}-${suffix}-no`.toUpperCase(),
        passwordHash,
        status: overrides.status ?? UserStatus.ACTIVE,
        mustChangePassword: overrides.mustChangePassword ?? false,
        resourceProfileId: employeeProfile.id,
        userRoles: {
          create: (overrides.roleIds ?? [employeeRole.id]).map((roleId) => ({
            roleId,
            assignedByUserId: admin.user.id,
          })),
        },
      },
    });
    cleanupUserIds.add(user.id);
    return user;
  }

  function login(username: string, deviceName: string) {
    return auth.login(
      {
        identifier: username,
        password: temporaryPassword,
        rememberMe: false,
      },
      {
        deviceName,
        userAgent: 'task7-integration-test',
        ipAddress: '127.0.0.1',
      },
    );
  }
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
