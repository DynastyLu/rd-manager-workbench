import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DataScopeService } from '../../../../modules/iam/application/data-scope.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import type { PermissionCode } from '../../../../modules/iam/domain/permission-catalog';
import { ActivityService } from '../../activity/application/activity.service';
import {
  CreateEmployeeDto,
  EmployeeArchiveState,
  ListEmployeesQueryDto,
  MAX_EMPLOYEE_PAGE,
  MAX_EMPLOYEE_PAGE_SIZE,
  UpdateEmployeeDto,
} from '../interface/http/dto/employees.dto';

const orderedSkills = { skills: { orderBy: { name: 'asc' as const } } };

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly activities: ActivityService,
    private readonly dataScope: DataScopeService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(query: ListEmployeesQueryDto) {
    const principal = this.requestContext.requirePrincipal();
    const page = this.normalizePaginationValue(query.page, 1, MAX_EMPLOYEE_PAGE);
    const pageSize = this.normalizePaginationValue(query.pageSize, 20, MAX_EMPLOYEE_PAGE_SIZE);
    const scopeWhere = this.dataScope.employees(principal, 'employee.read');
    const searchWhere = query.q
      ? {
          OR: [
            { displayName: { contains: query.q, mode: 'insensitive' as const } },
            { roleTitle: { contains: query.q, mode: 'insensitive' as const } },
            { department: { contains: query.q, mode: 'insensitive' as const } },
            { workDirection: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const where: Prisma.ResourceProfileWhereInput = {
      archivedAt:
        query.archiveState === EmployeeArchiveState.ARCHIVED ? { not: null } : null,
      ...(Object.keys(scopeWhere).length > 0 && searchWhere
        ? { AND: [scopeWhere, searchWhere] }
        : Object.keys(scopeWhere).length > 0
          ? scopeWhere
          : searchWhere ?? {}),
      ...(query.department ? { department: query.department } : {}),
      ...(query.workDirection ? { workDirection: query.workDirection } : {}),
      ...(query.employmentStatus ? { employmentStatus: query.employmentStatus } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.resourceProfile.findMany({
        where,
        include: orderedSkills,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.resourceProfile.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async create(dto: CreateEmployeeDto) {
    try {
      return await this.prisma.resourceProfile.create({
        data: dto,
        include: orderedSkills,
      });
    } catch (error) {
      await this.throwDuplicateName(error, dto.displayName);
      throw error;
    }
  }

  async get(id: string) {
    const principal = this.requestContext.requirePrincipal();
    const employee = await this.prisma.resourceProfile.findFirst({
      where: { id, ...this.dataScope.employees(principal, 'employee.read') },
      include: {
        skills: { orderBy: { name: 'asc' } },
        loadEntries: {
          where: { archivedAt: null },
          orderBy: { weekStartAt: 'desc' },
        },
      },
    });
    if (!employee) {
      await this.assertExistsOrThrow(id);
    }
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.assertAccessible(id, 'employee.update');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.lockActiveEmployee(transaction, id);
        const employee = await transaction.resourceProfile.update({
          where: { id },
          data: dto,
          include: orderedSkills,
        });
        await this.appendLifecycleActivity(
          transaction,
          employee,
          'UPDATED',
          `更新员工档案：${employee.displayName}`,
        );
        return employee;
      });
    } catch (error) {
      await this.throwDuplicateName(error, dto.displayName);
      throw error;
    }
  }

  async archive(id: string) {
    await this.assertAccessible(id, 'employee.archive');
    await this.prisma.$transaction(async (transaction) => {
      await this.lockActiveEmployee(transaction, id);
      // Import-owned load entries (linked to an employee work item) are historical import
      // data and must not block archiving; only manually-created active entries do.
      const activeLoadEntryCount = await transaction.resourceLoadEntry.count({
        where: { resourceId: id, archivedAt: null, employeeWorkItemId: null },
      });
      if (activeLoadEntryCount > 0) {
        throw new AppError({
          code: ErrorCodes.RESOURCE_LOAD_REFERENCE_INVALID,
          message: 'Archive load entries before archiving employee',
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        });
      }
      const employee = await transaction.resourceProfile.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.appendLifecycleActivity(
        transaction,
        employee,
        'ARCHIVED',
        `归档员工档案：${employee.displayName}`,
      );
    });
  }

  async restore(id: string) {
    await this.assertAccessible(id, 'employee.archive');
    return this.prisma.$transaction(async (transaction) => {
      const employee = await this.lockEmployee(transaction, id);
      if (employee.archivedAt === null) {
        return transaction.resourceProfile.findUniqueOrThrow({
          where: { id },
          include: orderedSkills,
        });
      }
      const restored = await transaction.resourceProfile.update({
        where: { id },
        data: { archivedAt: null },
        include: orderedSkills,
      });
      await this.appendLifecycleActivity(
        transaction,
        restored,
        'RESTORED',
        `恢复员工档案：${restored.displayName}`,
      );
      return restored;
    });
  }

  async permanentDelete(id: string) {
    await this.assertAccessible(id, 'employee.delete');
    await this.prisma.$transaction(async (transaction) => {
      const employee = await this.lockEmployee(transaction, id);
      const [workItems, weekPlans, importRows, loadEntries] = await Promise.all([
        transaction.employeeWorkItem.count({ where: { employeeId: id } }),
        transaction.employeeWeekPlanItem.count({ where: { employeeId: id } }),
        transaction.employeeWorkImportRow.count({ where: { resolvedEmployeeId: id } }),
        transaction.resourceLoadEntry.count({ where: { resourceId: id } }),
      ]);
      const counts = { workItems, weekPlans, importRows, loadEntries };
      if (Object.values(counts).some((count) => count > 0)) {
        throw new AppError({
          code: ErrorCodes.EMPLOYEE_DELETE_BLOCKED,
          message: 'Employee has historical work data and cannot be permanently deleted',
          statusCode: HttpStatus.CONFLICT,
          details: { counts },
        });
      }
      await this.appendLifecycleActivity(
        transaction,
        employee,
        'PERMANENTLY_DELETED',
        `永久删除员工档案：${employee.displayName}`,
      );
      await transaction.resourceSkill.deleteMany({ where: { resourceId: id } });
      await transaction.resourceProfile.delete({ where: { id } });
    });
  }

  private normalizePaginationValue(value: number | undefined, fallback: number, maximum: number) {
    if (value === undefined || !Number.isFinite(value) || !Number.isInteger(value)) {
      return fallback;
    }
    return Math.min(Math.max(value, 1), maximum);
  }

  private async assertAccessible(id: string, permissionCode: PermissionCode) {
    const principal = this.requestContext.requirePrincipal();
    const accessible = await this.prisma.resourceProfile.findFirst({
      where: { id, ...this.dataScope.employees(principal, permissionCode) },
      select: { id: true },
    });
    if (!accessible) {
      await this.assertExistsOrThrow(id);
    }
  }

  private async assertExistsOrThrow(id: string) {
    const exists = await this.prisma.resourceProfile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (exists) {
      throw this.permissionDenied();
    }
    throw this.notFound();
  }

  private permissionDenied() {
    return new AppError({
      code: ErrorCodes.PERMISSION_DENIED,
      message: 'Access to this employee is not allowed',
      statusCode: HttpStatus.FORBIDDEN,
    });
  }

  private async lockActiveEmployee(transaction: Prisma.TransactionClient, id: string) {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM app.resource_profiles WHERE id = ${id} AND archived_at IS NULL FOR UPDATE`,
    );
    if (rows.length === 0) {
      throw this.notFound();
    }
  }

  private async lockEmployee(transaction: Prisma.TransactionClient, id: string) {
    const rows = await transaction.$queryRaw<
      Array<{ id: string; displayName: string; archivedAt: Date | null }>
    >(
      Prisma.sql`SELECT id, display_name AS "displayName", archived_at AS "archivedAt"
        FROM app.resource_profiles WHERE id = ${id} FOR UPDATE`,
    );
    const employee = rows[0];
    if (!employee) {
      throw this.notFound();
    }
    return employee;
  }

  private async throwDuplicateName(error: unknown, displayName?: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      this.isDisplayNameTarget(error.meta?.target)
    ) {
      const existing = displayName
        ? await this.prisma.resourceProfile.findUnique({
            where: { displayName },
            select: { id: true, displayName: true, archivedAt: true },
          })
        : null;
      if (existing?.archivedAt) {
        throw new AppError({
          code: ErrorCodes.EMPLOYEE_ARCHIVED_EXISTS,
          message: 'Employee is archived',
          statusCode: HttpStatus.CONFLICT,
          details: { employeeId: existing.id, displayName: existing.displayName },
        });
      }
      throw new AppError({
        code: ErrorCodes.RESOURCE_NAME_EXISTS,
        message: 'Employee name already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private appendLifecycleActivity(
    transaction: Prisma.TransactionClient,
    employee: { id: string; displayName: string },
    action: string,
    summary: string,
  ) {
    return this.activities.append(
      {
        actorKind: 'HUMAN',
        objectType: 'RESOURCE_PROFILE',
        objectId: employee.id,
        employeeId: employee.id,
        action,
        summary,
        sourcePath: `/employees?employeeId=${encodeURIComponent(employee.id)}`,
      },
      transaction,
    );
  }

  private isDisplayNameTarget(target: unknown) {
    const fields = Array.isArray(target) ? target : [target];
    return fields.some((field) => field === 'display_name' || field === 'displayName');
  }

  private notFound() {
    return new AppError({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      message: 'Employee not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
