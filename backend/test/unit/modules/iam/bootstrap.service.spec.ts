import type { ConfigService } from '@nestjs/config';
import { EmploymentStatus } from '@prisma/client';
import type { AppEnv } from '../../../../src/infrastructure/config/env.schema';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { BootstrapService } from '../../../../src/modules/iam/application/bootstrap.service';
import { PasswordService } from '../../../../src/modules/iam/application/password.service';
import {
  BUILT_IN_ROLES,
  PERMISSION_CATALOG,
} from '../../../../src/modules/iam/domain/permission-catalog';

describe('BootstrapService', () => {
  const defaultAdminUsername = 'admin';
  const defaultAdminPassword = 'RdManager2026!';

  function createConfig(overrides: Partial<AppEnv> = {}) {
    const env: AppEnv = {
      NODE_ENV: 'test',
      SERVICE_NAME: 'rd-manager-workbench',
      INSTANCE_ID: 'test',
      HOST: '127.0.0.1',
      PORT: 4311,
      DATABASE_URL:
        'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app',
      LOCAL_STORAGE_ROOT: 'var/storage',
      BACKUP_PROCESS_TIMEOUT_MS: 300_000,
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-characters-long',
      JWT_ACCESS_TTL_MINUTES: 15,
      JWT_REFRESH_TTL_DAYS: 7,
      JWT_REFRESH_REMEMBER_TTL_DAYS: 30,
      AUTH_COOKIE_NAME: 'rd_refresh',
      AUTH_COOKIE_SECURE: false,
      AUTH_ALLOWED_ORIGINS: 'http://127.0.0.1:4312',
      DEFAULT_ADMIN_USERNAME: defaultAdminUsername,
      DEFAULT_ADMIN_PASSWORD: defaultAdminPassword,
      ...overrides,
    } as AppEnv;
    return {
      get: jest.fn((key: keyof AppEnv) => env[key]),
    } as unknown as ConfigService<AppEnv, true>;
  }

  function createService(mocks: {
    transaction: Record<string, unknown>;
    prisma?: Record<string, unknown>;
    password?: Partial<PasswordService>;
  }) {
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof mocks.transaction) => Promise<unknown>) =>
        callback(mocks.transaction),
      ),
      ...mocks.prisma,
    } as unknown as PlatformPrismaService;
    const password = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      ...mocks.password,
    } as unknown as PasswordService;
    return { service: new BootstrapService(prisma, password, createConfig()), prisma, password };
  }

  it('returns bootstrap status as not required', async () => {
    const { service } = createService({ transaction: {} });
    await expect(service.status()).resolves.toEqual({ required: false });
  });

  it('creates a default administrator and system employee when no users exist', async () => {
    const createdUser = { id: 'user-1', username: defaultAdminUsername };
    const superAdminRole = { id: 'role-super-admin' };
    const transaction = {
      $executeRaw: jest.fn(),
      resourceProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      role: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(superAdminRole),
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'role-super-admin', code: BUILT_IN_ROLES.SUPER_ADMIN.code },
          { id: 'role-employee', code: BUILT_IN_ROLES.EMPLOYEE.code },
        ]),
      },
      userRole: { create: jest.fn() },
      user: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdUser),
      },
      permission: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      rolePermission: { createMany: jest.fn() },
    };
    const { service, password } = createService({ transaction });

    await service.onApplicationBootstrap();

    expect(transaction.$executeRaw).toHaveBeenCalled();
    expect(transaction.resourceProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { displayName: '系统管理员' },
        create: expect.objectContaining({
          displayName: '系统管理员',
          department: '系统管理',
          roleTitle: '超级管理员',
          employmentStatus: EmploymentStatus.ACTIVE,
        }),
        update: {},
      }),
    );
    expect(password.hash).toHaveBeenCalledWith(defaultAdminPassword);
    expect(transaction.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: defaultAdminUsername,
          employeeNo: 'ADMIN',
          status: 'ACTIVE',
          mustChangePassword: true,
          resourceProfileId: 'profile-1',
        }),
      }),
    );
    expect(transaction.userRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: createdUser.id,
          roleId: superAdminRole.id,
        }),
      }),
    );
  });

  it('does not create a default administrator when users already exist', async () => {
    const transaction = {
      $executeRaw: jest.fn(),
      resourceProfile: { upsert: jest.fn() },
      role: {
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'role-super-admin', code: BUILT_IN_ROLES.SUPER_ADMIN.code },
          { id: 'role-employee', code: BUILT_IN_ROLES.EMPLOYEE.code },
        ]),
      },
      userRole: { create: jest.fn() },
      user: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
      },
      permission: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      rolePermission: { createMany: jest.fn() },
    };
    const { service, password } = createService({ transaction });

    await service.onApplicationBootstrap();

    expect(transaction.resourceProfile.upsert).not.toHaveBeenCalled();
    expect(transaction.user.create).not.toHaveBeenCalled();
    expect(transaction.userRole.create).not.toHaveBeenCalled();
    expect(password.hash).not.toHaveBeenCalled();
  });

  it('synchronizes the complete catalog idempotently without replacing role grants', async () => {
    const permissionIds = PERMISSION_CATALOG.map(({ code }, index) => ({
      id: `permission-${index}`,
      code,
    }));
    const roleIds = Object.values(BUILT_IN_ROLES).map(({ code }) => ({
      id: `role-${code}`,
      code,
    }));
    const transaction = {
      $executeRaw: jest.fn(),
      resourceProfile: { create: jest.fn() },
      role: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue(roleIds),
        findUniqueOrThrow: jest.fn(),
      },
      userRole: { create: jest.fn() },
      user: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
      },
      permission: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue(permissionIds),
      },
      rolePermission: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const { service } = createService({ transaction });

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    expect(transaction.permission.upsert).toHaveBeenCalledTimes(PERMISSION_CATALOG.length * 2);
    expect(transaction.role.upsert).toHaveBeenCalledTimes(Object.keys(BUILT_IN_ROLES).length * 2);
    expect(transaction.rolePermission.createMany).toHaveBeenCalledTimes(2);
    expect(transaction.rolePermission.createMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(transaction.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(transaction.rolePermission.updateMany).not.toHaveBeenCalled();

    for (const call of (transaction.role.upsert as jest.Mock).mock.calls) {
      expect(call[0].update).not.toHaveProperty('isEnabled');
    }
  });
});
