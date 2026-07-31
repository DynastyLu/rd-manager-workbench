import { HttpStatus } from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import { ActivityService } from '../../../../src/modules/workbench/activity/application/activity.service';
import { EmployeesService } from '../../../../src/modules/workbench/employees/application/employees.service';
import {
  EmployeeArchiveState,
  MAX_EMPLOYEE_PAGE,
  MAX_EMPLOYEE_PAGE_SIZE,
} from '../../../../src/modules/workbench/employees/interface/http/dto/employees.dto';

const mockPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'tester',
  sessionId: 'session-1',
  roleCodes: ['EMPLOYEE'],
  permissions: [],
  permissionVersion: 1,
  mustChangePassword: false,
};
const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue(mockPrincipal),
} as unknown as RequestContextService;
const mockDataScope = {
  projects: jest.fn().mockReturnValue({}),
  tasks: jest.fn().mockReturnValue({}),
  employees: jest.fn().mockReturnValue({}),
  employeeWork: jest.fn().mockReturnValue({}),
  meetings: jest.fn().mockReturnValue({}),
  documents: jest.fn().mockReturnValue({}),
  knowledge: jest.fn().mockReturnValue({}),
  decisions: jest.fn().mockReturnValue({}),
  issues: jest.fn().mockReturnValue({}),
  risks: jest.fn().mockReturnValue({}),
  partners: jest.fn().mockReturnValue({}),
  communications: jest.fn().mockReturnValue({}),
  baseTables: jest.fn().mockReturnValue({}),
  baseRecords: jest.fn().mockReturnValue({}),
  activities: jest.fn().mockReturnValue({}),
} as unknown as DataScopeService;

describe('EmployeesService', () => {
  const appendActivity = jest.fn().mockResolvedValue(undefined);
  const activities = { append: appendActivity } as unknown as ActivityService;

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('lists active employees with search, department filters, and pagination', async () => {
    const employee = {
      id: 'employee-1',
      displayName: '研发主管',
      department: '研发部',
      workDirection: '平台研发',
      roleTitle: '负责人',
      employmentStatus: EmploymentStatus.ACTIVE,
      skills: [],
    };
    const findMany = jest.fn().mockResolvedValue([employee]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      resourceProfile: { findMany, count },
      $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(
      service.list({
        q: '研发',
        department: '研发部',
        workDirection: '平台研发',
        employmentStatus: EmploymentStatus.ACTIVE,
        page: 2,
        pageSize: 5,
      }),
    ).resolves.toEqual({
      data: [employee],
      meta: { page: 2, pageSize: 5, total: 1 },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        department: '研发部',
        workDirection: '平台研发',
        employmentStatus: EmploymentStatus.ACTIVE,
        OR: [
          { displayName: { contains: '研发', mode: 'insensitive' } },
          { roleTitle: { contains: '研发', mode: 'insensitive' } },
          { department: { contains: '研发', mode: 'insensitive' } },
          { workDirection: { contains: '研发', mode: 'insensitive' } },
        ],
      },
      include: { skills: { orderBy: { name: 'asc' } } },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        department: '研发部',
        workDirection: '平台研发',
        employmentStatus: EmploymentStatus.ACTIVE,
        OR: [
          { displayName: { contains: '研发', mode: 'insensitive' } },
          { roleTitle: { contains: '研发', mode: 'insensitive' } },
          { department: { contains: '研发', mode: 'insensitive' } },
          { workDirection: { contains: '研发', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('lists only archived employees when archiveState is ARCHIVED', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      resourceProfile: { findMany, count },
      $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await service.list({ archiveState: EmployeeArchiveState.ARCHIVED });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archivedAt: { not: null } } }),
    );
    expect(count).toHaveBeenCalledWith({ where: { archivedAt: { not: null } } });
  });

  it.each([
    {
      label: 'an oversized page',
      page: MAX_EMPLOYEE_PAGE + 1,
      expectedPage: MAX_EMPLOYEE_PAGE,
      expectedSkip: (MAX_EMPLOYEE_PAGE - 1) * 2,
    },
    { label: 'a negative page', page: -1, expectedPage: 1, expectedSkip: 0 },
    { label: 'a NaN page', page: Number.NaN, expectedPage: 1, expectedSkip: 0 },
    { label: 'an infinite page', page: Number.POSITIVE_INFINITY, expectedPage: 1, expectedSkip: 0 },
    { label: 'a fractional page', page: 1.5, expectedPage: 1, expectedSkip: 0 },
  ])(
    'normalizes $label when service.list bypasses HTTP validation',
    async ({ page, expectedPage, expectedSkip }) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        resourceProfile: {
          findMany,
          count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
      } as unknown as PlatformPrismaService;
      const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

      await expect(service.list({ page, pageSize: 2 })).resolves.toMatchObject({
        meta: { page: expectedPage, pageSize: 2, total: 0 },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: expectedSkip, take: 2 }),
      );
    },
  );

  it.each([
    { label: 'zero page size', pageSize: 0, expectedPageSize: 1, expectedSkip: 1 },
    { label: 'a negative page size', pageSize: -1, expectedPageSize: 1, expectedSkip: 1 },
    {
      label: 'an oversized page size',
      pageSize: MAX_EMPLOYEE_PAGE_SIZE + 1,
      expectedPageSize: MAX_EMPLOYEE_PAGE_SIZE,
      expectedSkip: MAX_EMPLOYEE_PAGE_SIZE,
    },
    { label: 'a NaN page size', pageSize: Number.NaN, expectedPageSize: 20, expectedSkip: 20 },
    {
      label: 'an infinite page size',
      pageSize: Number.POSITIVE_INFINITY,
      expectedPageSize: 20,
      expectedSkip: 20,
    },
    { label: 'a fractional page size', pageSize: 1.5, expectedPageSize: 20, expectedSkip: 20 },
  ])(
    'normalizes $label when service.list bypasses HTTP validation',
    async ({ pageSize, expectedPageSize, expectedSkip }) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        resourceProfile: {
          findMany,
          count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
      } as unknown as PlatformPrismaService;
      const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

      await expect(service.list({ page: 2, pageSize })).resolves.toMatchObject({
        meta: { page: 2, pageSize: expectedPageSize, total: 0 },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: expectedSkip, take: expectedPageSize }),
      );
    },
  );

  it('translates duplicate display names into RESOURCE_NAME_EXISTS', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.6.0',
      meta: { target: ['display_name'] },
    });
    const prisma = {
      resourceProfile: {
        create: jest.fn().mockRejectedValue(duplicate),
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-active',
          displayName: '重复员工',
          archivedAt: null,
        }),
      },
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.create({ displayName: '重复员工' })).rejects.toMatchObject({
      code: 'RESOURCE_NAME_EXISTS',
      statusCode: HttpStatus.CONFLICT,
    });
  });

  it('returns a recoverable conflict for an archived duplicate employee', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.6.0',
      meta: { target: ['display_name'] },
    });
    const prisma = {
      resourceProfile: {
        create: jest.fn().mockRejectedValue(duplicate),
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-archived',
          displayName: '归档员工',
          archivedAt: new Date(),
        }),
      },
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.create({ displayName: '归档员工' })).rejects.toMatchObject({
      code: 'EMPLOYEE_ARCHIVED_EXISTS',
      statusCode: HttpStatus.CONFLICT,
      details: { employeeId: 'employee-archived', displayName: '归档员工' },
    });
  });

  it('restores an archived employee and returns the original profile', async () => {
    const restored = { id: 'employee-1', displayName: '员工', archivedAt: null, skills: [] };
    const transactionClient = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'employee-1', displayName: '员工', archivedAt: new Date() }]),
      resourceProfile: { update: jest.fn().mockResolvedValue(restored) },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.restore('employee-1')).resolves.toEqual(restored);
    expect(transactionClient.resourceProfile.update).toHaveBeenCalledWith({
      where: { id: 'employee-1' },
      data: { archivedAt: null },
      include: { skills: { orderBy: { name: 'asc' } } },
    });
    expect(appendActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        action: 'RESTORED',
        summary: '恢复员工档案：员工',
      }),
      transactionClient,
    );
  });

  it('blocks permanent deletion when historical employee data exists', async () => {
    const transactionClient = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'employee-1', displayName: '员工', archivedAt: null }]),
      employeeWorkItem: { count: jest.fn().mockResolvedValue(2) },
      employeeWeekPlanItem: { count: jest.fn().mockResolvedValue(1) },
      employeeWorkImportRow: { count: jest.fn().mockResolvedValue(0) },
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(0) },
      resourceSkill: { deleteMany: jest.fn() },
      resourceProfile: { delete: jest.fn() },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.permanentDelete('employee-1')).rejects.toMatchObject({
      code: 'EMPLOYEE_DELETE_BLOCKED',
      statusCode: HttpStatus.CONFLICT,
      details: {
        counts: { workItems: 2, weekPlans: 1, importRows: 0, loadEntries: 0 },
      },
    });
    expect(transactionClient.resourceProfile.delete).not.toHaveBeenCalled();
    expect(appendActivity).not.toHaveBeenCalled();
  });

  it('permanently deletes an unused active employee', async () => {
    const transactionClient = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'employee-active', displayName: '在职员工', archivedAt: null }]),
      employeeWorkItem: { count: jest.fn().mockResolvedValue(0) },
      employeeWeekPlanItem: { count: jest.fn().mockResolvedValue(0) },
      employeeWorkImportRow: { count: jest.fn().mockResolvedValue(0) },
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(0) },
      resourceSkill: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      resourceProfile: { delete: jest.fn().mockResolvedValue({ id: 'employee-active' }) },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-active' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.permanentDelete('employee-active')).resolves.toBeUndefined();
    expect(transactionClient.resourceProfile.delete).toHaveBeenCalledWith({
      where: { id: 'employee-active' },
    });
  });

  it('permanently deletes an unused archived employee', async () => {
    const transactionClient = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'employee-1', displayName: '员工', archivedAt: new Date() }]),
      employeeWorkItem: { count: jest.fn().mockResolvedValue(0) },
      employeeWeekPlanItem: { count: jest.fn().mockResolvedValue(0) },
      employeeWorkImportRow: { count: jest.fn().mockResolvedValue(0) },
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(0) },
      resourceSkill: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      resourceProfile: { delete: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.permanentDelete('employee-1')).resolves.toBeUndefined();
    expect(transactionClient.resourceSkill.deleteMany).toHaveBeenCalledWith({
      where: { resourceId: 'employee-1' },
    });
    expect(transactionClient.resourceProfile.delete).toHaveBeenCalledWith({
      where: { id: 'employee-1' },
    });
    expect(appendActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        action: 'PERMANENTLY_DELETED',
        summary: '永久删除员工档案：员工',
      }),
      transactionClient,
    );
  });

  it('does not translate P2002 errors for constraints other than displayName', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.6.0',
      meta: { target: ['other_unique_field'] },
    });
    const prisma = {
      resourceProfile: { create: jest.fn().mockRejectedValue(duplicate) },
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.create({ displayName: '员工' })).rejects.toBe(duplicate);
  });

  it('locks and updates an active employee in the same transaction', async () => {
    const updated = {
      id: 'employee-1',
      displayName: '更新后的员工',
      employmentStatus: EmploymentStatus.ON_LEAVE,
    };
    const update = jest.fn().mockResolvedValue(updated);
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      resourceProfile: { update },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(
      service.update('employee-1', {
        displayName: '更新后的员工',
        employmentStatus: EmploymentStatus.ON_LEAVE,
      }),
    ).resolves.toEqual(updated);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionClient.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'employee-1' },
      data: {
        displayName: '更新后的员工',
        employmentStatus: EmploymentStatus.ON_LEAVE,
      },
      include: { skills: { orderBy: { name: 'asc' } } },
    });
    expect(appendActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        action: 'UPDATED',
        summary: '更新员工档案：更新后的员工',
      }),
      transactionClient,
    );
  });

  it('soft-archives an active employee without load entries', async () => {
    const archivedAt = new Date('2026-07-23T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(archivedAt);
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(0) },
      resourceProfile: {
        update: jest.fn().mockResolvedValue({ id: 'employee-1', displayName: '员工' }),
      },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await service.archive('employee-1');

    expect(transactionClient.resourceLoadEntry.count).toHaveBeenCalledWith({
      where: { resourceId: 'employee-1', archivedAt: null, employeeWorkItemId: null },
    });
    expect(transactionClient.resourceProfile.update).toHaveBeenCalledWith({
      where: { id: 'employee-1' },
      data: { archivedAt },
    });
    expect(appendActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        action: 'ARCHIVED',
        summary: '归档员工档案：员工',
      }),
      transactionClient,
    );
  });

  it('archives an employee whose only active load entries are import-owned', async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      resourceLoadEntry: {
        // One import-owned active entry exists; the guard must exclude it from the blocking count.
        count: jest.fn(({ where }: { where: { employeeWorkItemId?: string | null } }) =>
          Promise.resolve(where.employeeWorkItemId === null ? 0 : 1),
        ),
      },
      resourceProfile: { update: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.archive('employee-1')).resolves.toBeUndefined();
    expect(transactionClient.resourceProfile.update).toHaveBeenCalledTimes(1);
  });

  it('blocks archiving an employee with an active manual load entry', async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      resourceLoadEntry: {
        count: jest.fn(({ where }: { where: { employeeWorkItemId?: string | null } }) =>
          Promise.resolve(where.employeeWorkItemId === null ? 1 : 0),
        ),
      },
      resourceProfile: { update: jest.fn() },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.archive('employee-1')).rejects.toMatchObject({
      code: 'RESOURCE_LOAD_REFERENCE_INVALID',
      message: 'Archive load entries before archiving employee',
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(transactionClient.resourceProfile.update).not.toHaveBeenCalled();
  });

  it('blocks archiving an employee with active resource load entries', async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(1) },
      resourceProfile: { update: jest.fn() },
    };
    const prisma = {
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma, activities, mockDataScope, mockRequestContext);

    await expect(service.archive('employee-1')).rejects.toMatchObject({
      code: 'RESOURCE_LOAD_REFERENCE_INVALID',
      message: 'Archive load entries before archiving employee',
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(transactionClient.resourceLoadEntry.count).toHaveBeenCalledWith({
      where: { resourceId: 'employee-1', archivedAt: null, employeeWorkItemId: null },
    });
    expect(transactionClient.resourceProfile.update).not.toHaveBeenCalled();
  });
});
