import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { EmploymentStatus, Prisma, UserStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';
import { NotificationsGateway } from '../../workbench/notifications/notifications.gateway';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from '../interface/http/dto/users.dto';
import { PasswordService } from './password.service';

const USER_DETAIL_INCLUDE = {
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
    include: {
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          isSystem: true,
          isEnabled: true,
        },
      },
    },
    orderBy: { role: { code: 'asc' as const } },
  },
} satisfies Prisma.UserInclude;

type UserDetail = Prisma.UserGetPayload<{ include: typeof USER_DETAIL_INCLUDE }>;
type Transaction = Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly passwordService: PasswordService,
    @Optional() private readonly liveConnections?: NotificationsGateway,
  ) {}

  async list(input: ListUsersQueryDto) {
    const search = input.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.department
        ? {
            resourceProfile: {
              department: { equals: input.department.trim(), mode: 'insensitive' },
            },
          }
        : {}),
      ...(input.roleId ? { userRoles: { some: { roleId: input.roleId } } } : {}),
      ...(search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { employeeNo: { contains: search, mode: 'insensitive' } },
              {
                resourceProfile: {
                  displayName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: USER_DETAIL_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return {
      data: users.map((user) => this.present(user)),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(userId: string) {
    return this.present(await this.requireUser(this.prisma, userId));
  }

  async create(input: CreateUserDto, actorUserId: string) {
    const username = normalizeUsername(input.username);
    const employeeNo = input.employeeNo ? normalizeEmployeeNo(input.employeeNo) : null;
    const passwordHash = await this.passwordService.hash(input.temporaryPassword);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lock(transaction, input.resourceProfileId);
        const resourceProfile = await transaction.resourceProfile.findUnique({
          where: { id: input.resourceProfileId },
          include: { user: { select: { id: true } } },
        });
        if (!resourceProfile) {
          throw new AppError({
            code: ErrorCodes.RESOURCE_NOT_FOUND,
            message: 'Employee not found',
            statusCode: HttpStatus.NOT_FOUND,
          });
        }
        if (resourceProfile.user) throw employeeAlreadyBound();
        if (
          resourceProfile.archivedAt ||
          resourceProfile.employmentStatus === EmploymentStatus.LEFT
        ) {
          throw employeeNotEligible();
        }

        await lockIdentifiers(transaction);
        await this.assertIdentifiersAvailable(transaction, username, employeeNo);
        const roles = await this.resolveRoles(transaction, input.roleIds);
        const created = await transaction.user.create({
          data: {
            username,
            employeeNo,
            passwordHash,
            status: UserStatus.PENDING,
            mustChangePassword: true,
            resourceProfileId: resourceProfile.id,
            userRoles: {
              create: roles.map((role) => ({
                roleId: role.id,
                assignedByUserId: actorUserId,
              })),
            },
          },
          include: USER_DETAIL_INCLUDE,
        });
        await this.audit(transaction, created, 'USER_CREATED');
        return this.present(created);
      });
    } catch (error) {
      throw mapUserWriteError(error);
    }
  }

  async update(userId: string, input: UpdateUserDto, actorUserId: string) {
    try {
      const { presented, rolesChanged } = await this.withLockedUser(
        userId,
        async (transaction, current) => {
          const username =
            input.username === undefined ? current.username : normalizeUsername(input.username);
          const employeeNo =
            input.employeeNo === undefined
              ? current.employeeNo
              : input.employeeNo === null
                ? null
                : normalizeEmployeeNo(input.employeeNo);
          if (input.username !== undefined || input.employeeNo !== undefined) {
            await lockIdentifiers(transaction);
          }
          await this.assertIdentifiersAvailable(transaction, username, employeeNo, userId);

          const nextRoles =
            input.roleIds === undefined
              ? undefined
              : await this.resolveRoles(transaction, input.roleIds);
          const rolesChanged =
            nextRoles !== undefined &&
            !sameIds(
              current.userRoles.map(({ roleId }) => roleId),
              nextRoles.map(({ id }) => id),
            );
          if (rolesChanged && this.isActiveSuperAdmin(current)) {
            const remainsSuperAdmin = nextRoles!.some(
              ({ code, isEnabled }) => code === 'SUPER_ADMIN' && isEnabled,
            );
            if (!remainsSuperAdmin) {
              await this.assertAnotherActiveSuperAdmin(transaction, userId);
            }
          }

          await transaction.user.update({
            where: { id: userId },
            data: {
              username,
              employeeNo,
              ...(rolesChanged ? { permissionVersion: { increment: 1 } } : {}),
            },
          });
          if (rolesChanged) {
            await transaction.userRole.deleteMany({ where: { userId } });
            await transaction.userRole.createMany({
              data: nextRoles!.map(({ id }) => ({
                userId,
                roleId: id,
                assignedByUserId: actorUserId,
              })),
            });
            await this.revokeSessions(transaction, userId, 'ROLE_ASSIGNMENT_CHANGED');
          }
          const updated = await this.requireUser(transaction, userId);
          await this.audit(
            transaction,
            updated,
            rolesChanged ? 'USER_ROLES_REPLACED' : 'USER_IDENTIFIERS_UPDATED',
          );
          return { presented: this.present(updated), rolesChanged };
        },
      );
      if (rolesChanged) {
        this.liveConnections?.emitPermissionsChanged(userId);
      }
      return presented;
    } catch (error) {
      throw mapUserWriteError(error);
    }
  }

  async resetPassword(userId: string, temporaryPassword: string) {
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    const result = await this.withLockedUser(userId, async (transaction) => {
      const revoked = await this.revokeSessions(
        transaction,
        userId,
        'ADMIN_PASSWORD_RESET',
      );
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
        include: USER_DETAIL_INCLUDE,
      });
      await this.audit(transaction, updated, 'USER_PASSWORD_RESET');
      return {
        ...this.present(updated),
        sessionsRevoked: revoked.count,
      };
    });
    this.liveConnections?.emitSessionRevoked(userId);
    return result;
  }

  async disable(userId: string) {
    const result = await this.withLockedUser(userId, async (transaction, current) => {
      if (this.isActiveSuperAdmin(current)) {
        await this.assertAnotherActiveSuperAdmin(transaction, userId);
      }
      const revoked = await this.revokeSessions(transaction, userId, 'ACCOUNT_DISABLED');
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.DISABLED,
          permissionVersion: { increment: 1 },
          lockedUntil: null,
        },
        include: USER_DETAIL_INCLUDE,
      });
      await this.audit(transaction, updated, 'USER_DISABLED');
      return {
        ...this.present(updated),
        sessionsRevoked: revoked.count,
      };
    });
    this.liveConnections?.emitSessionRevoked(userId);
    return result;
  }

  async enable(userId: string) {
    return this.withLockedUser(userId, async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.ACTIVE,
          failedLoginCount: 0,
          lockedUntil: null,
          permissionVersion: { increment: 1 },
        },
        include: USER_DETAIL_INCLUDE,
      });
      await this.audit(transaction, updated, 'USER_ENABLED');
      return this.present(updated);
    });
  }

  async listSessions(userId: string) {
    await this.requireUser(this.prisma, userId);
    return this.prisma.authSession.findMany({
      where: { userId },
      select: {
        id: true,
        tokenFamilyId: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        revokeReason: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async revokeAllSessions(userId: string) {
    const result = await this.withLockedUser(userId, async (transaction, current) => {
      const revoked = await this.revokeSessions(
        transaction,
        userId,
        'ADMIN_FORCE_LOGOUT',
      );
      await this.audit(transaction, current, 'USER_SESSIONS_REVOKED');
      return { sessionsRevoked: revoked.count };
    });
    this.liveConnections?.emitSessionRevoked(userId);
    return result;
  }

  async delete(
    userId: string,
    confirmNoOwnershipReferences: boolean,
  ): Promise<{ id: string; deleted: true; resourceProfileId: string }> {
    return this.withLockedUser(userId, async (transaction, current) => {
      if (this.isActiveSuperAdmin(current)) {
        await this.assertAnotherActiveSuperAdmin(transaction, userId);
      }
      if (current.status !== UserStatus.DISABLED) {
        throw new AppError({
          code: ErrorCodes.USER_DELETE_REQUIRES_DISABLED,
          message: 'Disable the account before deleting it',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      const activeSessions = await transaction.authSession.count({
        where: { userId, revokedAt: null },
      });
      if (activeSessions > 0) {
        throw new AppError({
          code: ErrorCodes.USER_DELETE_REQUIRES_SESSION_REVOCATION,
          message: 'Revoke every active session before deleting the account',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      if (!confirmNoOwnershipReferences) {
        throw new AppError({
          code: ErrorCodes.USER_OWNERSHIP_CONFIRMATION_REQUIRED,
          message: 'Ownership-reference confirmation is required',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      await this.audit(transaction, current, 'USER_DELETED');
      await transaction.authSession.deleteMany({ where: { userId } });
      await transaction.userRole.deleteMany({ where: { userId } });
      await transaction.user.delete({ where: { id: userId } });
      return {
        id: current.id,
        deleted: true,
        resourceProfileId: current.resourceProfileId,
      };
    });
  }

  private async withLockedUser<T>(
    userId: string,
    mutation: (transaction: Transaction, user: UserDetail) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await lock(transaction, userId);
      const user = await this.requireUser(transaction, userId);
      return mutation(transaction, user);
    });
  }

  private async requireUser(
    client: PlatformPrismaService | Transaction,
    userId: string,
  ): Promise<UserDetail> {
    const user = await client.user.findUnique({
      where: { id: userId },
      include: USER_DETAIL_INCLUDE,
    });
    if (!user) throw userNotFound();
    return user;
  }

  private async assertIdentifiersAvailable(
    transaction: Transaction,
    username: string,
    employeeNo: string | null,
    excludeUserId?: string,
  ): Promise<void> {
    const values = [...new Set([username, employeeNo].filter((value): value is string => !!value))];
    const matches = await transaction.user.findMany({
      where: {
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        OR: values.flatMap((value) => [
          { username: { equals: value, mode: 'insensitive' as const } },
          { employeeNo: { equals: value, mode: 'insensitive' as const } },
        ]),
      },
      select: { id: true, username: true, employeeNo: true },
      take: 2,
    });
    if (matches.length === 0) return;

    const crossColumnCollision = matches.some(
      (match) =>
        equalsIgnoreCase(username, match.employeeNo) ||
        equalsIgnoreCase(employeeNo, match.username),
    );
    throw new AppError({
      code: crossColumnCollision
        ? ErrorCodes.USER_IDENTIFIER_AMBIGUOUS
        : ErrorCodes.USER_IDENTIFIER_EXISTS,
      message: crossColumnCollision
        ? 'Username and employee number must not collide across accounts'
        : 'Username or employee number already exists',
      statusCode: HttpStatus.CONFLICT,
    });
  }

  private async resolveRoles(transaction: Transaction, roleIds: readonly string[]) {
    const uniqueRoleIds = [...new Set(roleIds)];
    const roles = await transaction.role.findMany({
      where: { id: { in: uniqueRoleIds }, isEnabled: true },
      select: { id: true, code: true, isEnabled: true },
    });
    if (roles.length !== uniqueRoleIds.length) {
      throw new AppError({
        code: ErrorCodes.USER_ROLE_INVALID,
        message: 'One or more assigned roles do not exist or are disabled',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    return roles;
  }

  private isActiveSuperAdmin(user: UserDetail): boolean {
    return (
      user.status === UserStatus.ACTIVE &&
      user.userRoles.some(
        ({ role }) => role.code === 'SUPER_ADMIN' && role.isEnabled,
      )
    );
  }

  private async assertAnotherActiveSuperAdmin(
    transaction: Transaction,
    userId: string,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'iam:last-active-super-admin'}, 0))`,
    );
    const otherCount = await transaction.user.count({
      where: {
        id: { not: userId },
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            role: { code: 'SUPER_ADMIN', isEnabled: true },
          },
        },
      },
    });
    if (otherCount === 0) {
      throw new AppError({
        code: ErrorCodes.USER_LAST_SUPER_ADMIN,
        message: 'The last active super administrator cannot be changed',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private revokeSessions(transaction: Transaction, userId: string, reason: string) {
    return transaction.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  private async audit(
    transaction: Transaction,
    user: Pick<UserDetail, 'id' | 'username'>,
    eventType: string,
  ): Promise<void> {
    await transaction.loginAudit.create({
      data: {
        userId: user.id,
        username: user.username,
        eventType,
        success: true,
      },
    });
  }

  private present(user: UserDetail) {
    return {
      id: user.id,
      username: user.username,
      employeeNo: user.employeeNo,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
      passwordChangedAt: user.passwordChangedAt,
      lastLoginAt: user.lastLoginAt,
      permissionVersion: user.permissionVersion,
      resourceProfileId: user.resourceProfileId,
      resourceProfile: user.resourceProfile,
      roles: user.userRoles.map(({ role }) => role),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

async function lock(transaction: Transaction, lockId: string): Promise<void> {
  await transaction.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockId}, 0))`,
  );
}

async function lockIdentifiers(transaction: Transaction): Promise<void> {
  await lock(transaction, 'iam:user-identifiers');
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmployeeNo(value: string): string {
  return value.trim().toUpperCase();
}

function equalsIgnoreCase(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left.toLowerCase() === right.toLowerCase();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join('\0') === [...right].sort().join('\0');
}

function userNotFound(): AppError {
  return new AppError({
    code: ErrorCodes.USER_NOT_FOUND,
    message: 'User not found',
    statusCode: HttpStatus.NOT_FOUND,
  });
}

function employeeAlreadyBound(): AppError {
  return new AppError({
    code: ErrorCodes.USER_EMPLOYEE_ALREADY_BOUND,
    message: 'Employee already has a user account',
    statusCode: HttpStatus.CONFLICT,
  });
}

function employeeNotEligible(): AppError {
  return new AppError({
    code: ErrorCodes.USER_EMPLOYEE_NOT_ELIGIBLE,
    message: 'Archived or departed employees cannot receive user accounts',
    statusCode: HttpStatus.CONFLICT,
  });
}

function mapUserWriteError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';
      if (target.includes('resource_profile_id')) return employeeAlreadyBound();
      return new AppError({
        code: ErrorCodes.USER_IDENTIFIER_EXISTS,
        message: 'Username or employee number already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
    if (error.code === 'P2025') return userNotFound();
  }
  return error;
}
