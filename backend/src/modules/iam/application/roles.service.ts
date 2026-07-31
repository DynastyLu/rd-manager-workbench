import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { DataScope, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';
import { NotificationsGateway } from '../../workbench/notifications/notifications.gateway';

export interface RolePermissionInput {
  permissionCode: string;
  dataScope: DataScope;
  scopeConfig?: Record<string, unknown> | null;
}

export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string | null;
  isEnabled?: boolean;
  permissions?: RolePermissionInput[];
}

export interface CopyRoleInput {
  code: string;
  name: string;
  description?: string | null;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  isEnabled?: boolean;
}

const ROLE_DETAIL_INCLUDE = {
  _count: { select: { userRoles: true } },
  rolePermissions: {
    include: { permission: true },
    orderBy: { permission: { code: 'asc' as const } },
  },
} satisfies Prisma.RoleInclude;

type RoleDetail = Prisma.RoleGetPayload<{ include: typeof ROLE_DETAIL_INCLUDE }>;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    @Optional() private readonly liveConnections?: NotificationsGateway,
  ) {}

  listPermissions() {
    return this.prisma.permission.findMany({
      select: {
        id: true,
        code: true,
        module: true,
        resource: true,
        action: true,
        description: true,
        isSensitive: true,
      },
      orderBy: [{ module: 'asc' }, { resource: 'asc' }, { action: 'asc' }, { code: 'asc' }],
    });
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: ROLE_DETAIL_INCLUDE,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }, { code: 'asc' }],
    });
    return roles.map((role) => this.present(role));
  }

  async create(input: CreateRoleInput) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const grants = await this.resolveGrants(transaction, input.permissions ?? []);
        const role = await transaction.role.create({
          data: {
            code: normalizeRoleCode(input.code),
            name: input.name.trim(),
            description: normalizeDescription(input.description),
            isEnabled: input.isEnabled ?? true,
            rolePermissions: {
              create: grants.map((grant) => ({
                permissionId: grant.permissionId,
                dataScope: grant.dataScope,
                scopeConfig: grant.scopeConfig,
              })),
            },
          },
          include: ROLE_DETAIL_INCLUDE,
        });
        return this.present(role);
      });
    } catch (error) {
      throw mapRoleWriteError(error);
    }
  }

  async copy(roleId: string, input: CopyRoleInput) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const source = await this.requireRole(transaction, roleId);
        const role = await transaction.role.create({
          data: {
            code: normalizeRoleCode(input.code),
            name: input.name.trim(),
            description:
              input.description === undefined
                ? source.description
                : normalizeDescription(input.description),
            isSystem: false,
            isEnabled: true,
            rolePermissions: {
              create: source.rolePermissions.map((grant) => ({
                permissionId: grant.permissionId,
                dataScope: grant.dataScope,
                scopeConfig: grant.scopeConfig ?? Prisma.JsonNull,
              })),
            },
          },
          include: ROLE_DETAIL_INCLUDE,
        });
        return this.present(role);
      });
    } catch (error) {
      throw mapRoleWriteError(error);
    }
  }

  async update(roleId: string, input: UpdateRoleInput) {
    const { role, enablementChanged } = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireRole(transaction, roleId);
      this.assertMutable(current);
      const enablementChanged =
        input.isEnabled !== undefined && input.isEnabled !== current.isEnabled;
      const updated = await transaction.role.update({
        where: { id: roleId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: normalizeDescription(input.description) }
            : {}),
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
        },
        include: ROLE_DETAIL_INCLUDE,
      });
      if (enablementChanged) {
        await this.bumpPermissionVersions(transaction, roleId);
      }
      return { role: this.present(updated), enablementChanged };
    });
    if (enablementChanged) {
      await this.emitPermissionChangesForRole(roleId);
    }
    return role;
  }

  async replacePermissions(roleId: string, permissions: RolePermissionInput[]) {
    const role = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireRole(transaction, roleId);
      this.assertMutable(current);
      const grants = await this.resolveGrants(transaction, permissions);
      await transaction.rolePermission.deleteMany({ where: { roleId } });
      if (grants.length > 0) {
        await transaction.rolePermission.createMany({
          data: grants.map((grant) => ({
            roleId,
            permissionId: grant.permissionId,
            dataScope: grant.dataScope,
            scopeConfig: grant.scopeConfig,
          })),
        });
      }
      await this.bumpPermissionVersions(transaction, roleId);
      const updated = await transaction.role.findUniqueOrThrow({
        where: { id: roleId },
        include: ROLE_DETAIL_INCLUDE,
      });
      return this.present(updated);
    });
    await this.emitPermissionChangesForRole(roleId);
    return role;
  }

  async delete(roleId: string): Promise<{ deleted: true }> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "app"."roles" WHERE "id" = ${roleId} FOR UPDATE`,
      );
      const role = await this.requireRole(transaction, roleId);
      this.assertMutable(role);
      if (role._count.userRoles > 0) {
        throw new AppError({
          code: ErrorCodes.ROLE_HAS_USERS,
          message: 'Role must be unassigned from all users before deletion',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      await transaction.role.delete({ where: { id: roleId } });
      return { deleted: true };
    });
  }

  private async requireRole(
    transaction: Prisma.TransactionClient,
    roleId: string,
  ): Promise<RoleDetail> {
    const role = await transaction.role.findUnique({
      where: { id: roleId },
      include: ROLE_DETAIL_INCLUDE,
    });
    if (!role) {
      throw new AppError({
        code: ErrorCodes.ROLE_NOT_FOUND,
        message: 'Role not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    return role;
  }

  private assertMutable(role: Pick<RoleDetail, 'isSystem'>): void {
    if (role.isSystem) {
      throw new AppError({
        code: ErrorCodes.ROLE_SYSTEM_PROTECTED,
        message: 'System roles cannot be modified or deleted',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private async resolveGrants(
    transaction: Prisma.TransactionClient,
    inputs: RolePermissionInput[],
  ) {
    const normalized = inputs.map((input) => ({
      permissionCode: input.permissionCode.trim(),
      dataScope: input.dataScope,
      scopeConfig: normalizeScopeConfig(input.dataScope, input.scopeConfig),
    }));
    const codes = normalized.map(({ permissionCode }) => permissionCode);
    if (new Set(codes).size !== codes.length) {
      throw invalidPermission('Each permission can only be granted once per role');
    }
    if (codes.length === 0) return [];

    const permissions = await transaction.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const permissionIds = new Map(permissions.map(({ id, code }) => [code, id]));
    if (permissionIds.size !== codes.length) {
      const unknownCodes = codes.filter((code) => !permissionIds.has(code));
      throw invalidPermission('One or more permission codes are unknown', {
        unknownCodes,
      });
    }
    return normalized.map((grant) => ({
      ...grant,
      permissionId: permissionIds.get(grant.permissionCode)!,
      scopeConfig: grant.scopeConfig ?? Prisma.JsonNull,
    }));
  }

  private async bumpPermissionVersions(
    transaction: Prisma.TransactionClient,
    roleId: string,
  ): Promise<void> {
    await transaction.user.updateMany({
      where: { userRoles: { some: { roleId } } },
      data: { permissionVersion: { increment: 1 } },
    });
  }

  private async emitPermissionChangesForRole(roleId: string): Promise<void> {
    if (!this.liveConnections) return;
    const users = await this.prisma.user.findMany({
      where: { userRoles: { some: { roleId } } },
      select: { id: true },
    });
    for (const user of users) {
      this.liveConnections.emitPermissionsChanged(user.id);
    }
  }

  private present(role: RoleDetail) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isEnabled: role.isEnabled,
      userCount: role._count.userRoles,
      permissions: role.rolePermissions.map((grant) => ({
        id: grant.permission.id,
        code: grant.permission.code,
        module: grant.permission.module,
        resource: grant.permission.resource,
        action: grant.permission.action,
        description: grant.permission.description,
        isSensitive: grant.permission.isSensitive,
        dataScope: grant.dataScope,
        scopeConfig: grant.scopeConfig,
      })),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}

function normalizeScopeConfig(
  dataScope: DataScope,
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  const source = value ?? {};
  const keys = Object.keys(source);
  if (dataScope === DataScope.DEPARTMENT) {
    if (keys.some((key) => key !== 'departmentNames')) {
      throw invalidScope('Department scope only accepts departmentNames');
    }
    return { departmentNames: normalizedStringList(source.departmentNames, 'departmentNames') };
  }
  if (dataScope === DataScope.PROJECT) {
    if (keys.some((key) => key !== 'projectIds')) {
      throw invalidScope('Project scope only accepts projectIds');
    }
    return { projectIds: normalizedStringList(source.projectIds, 'projectIds') };
  }
  if (keys.length > 0) {
    throw invalidScope(`${dataScope} scope does not accept scopeConfig`);
  }
  return undefined;
}

function normalizedStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw invalidScope(`${field} must be a non-empty string array with at most 100 entries`);
  }
  const normalized = value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (normalized.some((item) => item.length === 0 || item.length > 100)) {
    throw invalidScope(`${field} entries must be non-empty strings up to 100 characters`);
  }
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function normalizeRoleCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeDescription(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() || null;
}

function invalidPermission(message: string, details?: unknown): AppError {
  return new AppError({
    code: ErrorCodes.ROLE_PERMISSION_INVALID,
    message,
    statusCode: HttpStatus.BAD_REQUEST,
    details,
  });
}

function invalidScope(message: string): AppError {
  return new AppError({
    code: ErrorCodes.ROLE_SCOPE_INVALID,
    message,
    statusCode: HttpStatus.BAD_REQUEST,
  });
}

function mapRoleWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new AppError({
      code: ErrorCodes.ROLE_CODE_EXISTS,
      message: 'Role code already exists',
      statusCode: HttpStatus.CONFLICT,
    });
  }
  return error;
}
