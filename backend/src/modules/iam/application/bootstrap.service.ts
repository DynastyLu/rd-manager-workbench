import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataScope, EmploymentStatus, Prisma } from '@prisma/client';
import type { AppEnv } from '../../../infrastructure/config/env.schema';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import {
  BUILT_IN_ROLES,
  EMPLOYEE_DEFAULT_PERMISSION_CODES,
  PERMISSION_CATALOG,
} from '../domain/permission-catalog';
import { PasswordService } from './password.service';

const BOOTSTRAP_ADVISORY_LOCK = 2_607_300_400_001;

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly passwordService: PasswordService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async status(): Promise<{ required: boolean }> {
    return { required: false };
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.synchronizeAuthorizationCatalog(transaction);
      await this.ensureDefaultAdministrator(transaction);
    });
  }

  private async ensureDefaultAdministrator(
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK})`,
    );
    if ((await transaction.user.count()) !== 0) {
      return;
    }

    const username = this.config.get('DEFAULT_ADMIN_USERNAME', { infer: true }).trim().toLowerCase();
    const defaultPassword = this.config.get('DEFAULT_ADMIN_PASSWORD', { infer: true });
    const passwordHash = await this.passwordService.hash(defaultPassword);

    const profile = await transaction.resourceProfile.upsert({
      where: { displayName: '系统管理员' },
      create: {
        displayName: '系统管理员',
        department: '系统管理',
        roleTitle: '超级管理员',
        employmentStatus: EmploymentStatus.ACTIVE,
      },
      update: {},
      select: { id: true },
    });

    const superAdminRole = await transaction.role.findUniqueOrThrow({
      where: { code: BUILT_IN_ROLES.SUPER_ADMIN.code },
      select: { id: true },
    });

    const user = await transaction.user.create({
      data: {
        username,
        employeeNo: 'ADMIN',
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: true,
        resourceProfileId: profile.id,
      },
      select: { id: true, username: true },
    });

    await transaction.userRole.create({
      data: {
        userId: user.id,
        roleId: superAdminRole.id,
        assignedByUserId: user.id,
      },
    });

    this.logger.warn(
      `Default administrator "${user.username}" was created because no users existed. Change the default password on first login.`,
    );
  }

  private async synchronizeAuthorizationCatalog(
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    for (const entry of PERMISSION_CATALOG) {
      await transaction.permission.upsert({
        where: { code: entry.code },
        create: entry,
        update: {
          module: entry.module,
          resource: entry.resource,
          action: entry.action,
          description: entry.description,
          isSensitive: entry.isSensitive ?? false,
        },
      });
    }

    for (const role of Object.values(BUILT_IN_ROLES)) {
      await transaction.role.upsert({
        where: { code: role.code },
        create: { ...role, isSystem: true, isEnabled: true },
        update: {
          name: role.name,
          description: role.description,
          isSystem: true,
        },
      });
    }

    const [permissions, roles] = await Promise.all([
      transaction.permission.findMany({
        where: { code: { in: PERMISSION_CATALOG.map(({ code }) => code) } },
        select: { id: true, code: true },
      }),
      transaction.role.findMany({
        where: { code: { in: Object.keys(BUILT_IN_ROLES) } },
        select: { id: true, code: true },
      }),
    ]);
    const roleIds = new Map(roles.map(({ code, id }) => [code, id]));
    const superAdminRoleId = roleIds.get(BUILT_IN_ROLES.SUPER_ADMIN.code);
    const employeeRoleId = roleIds.get(BUILT_IN_ROLES.EMPLOYEE.code);
    if (!superAdminRoleId || !employeeRoleId) {
      throw new Error('Built-in IAM roles could not be initialized');
    }

    await transaction.rolePermission.createMany({
      data: [
        ...permissions.map(({ id }) => ({
          roleId: superAdminRoleId,
          permissionId: id,
          dataScope: DataScope.ALL,
        })),
        ...permissions
          .filter(({ code }) => EMPLOYEE_DEFAULT_PERMISSION_CODES.has(code))
          .map(({ id }) => ({
            roleId: employeeRoleId,
            permissionId: id,
            dataScope: DataScope.INVOLVED,
          })),
      ],
      skipDuplicates: true,
    });
  }
}
