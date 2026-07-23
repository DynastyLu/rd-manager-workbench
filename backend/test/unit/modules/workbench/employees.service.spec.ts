import { HttpStatus } from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { EmployeesService } from '../../../../src/modules/workbench/employees/application/employees.service';

describe('EmployeesService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists active employees with search, department filters, and pagination', async () => {
    const employee = {
      id: 'employee-1',
      displayName: '研发主管',
      department: '研发部',
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
    const service = new EmployeesService(prisma);

    await expect(
      service.list({
        q: '研发',
        department: '研发部',
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
        employmentStatus: EmploymentStatus.ACTIVE,
        OR: [
          { displayName: { contains: '研发', mode: 'insensitive' } },
          { roleTitle: { contains: '研发', mode: 'insensitive' } },
          { department: { contains: '研发', mode: 'insensitive' } },
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
        employmentStatus: EmploymentStatus.ACTIVE,
        OR: [
          { displayName: { contains: '研发', mode: 'insensitive' } },
          { roleTitle: { contains: '研发', mode: 'insensitive' } },
          { department: { contains: '研发', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('caps page size defensively when called outside the HTTP validation boundary', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      resourceProfile: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma);

    await expect(service.list({ page: 2, pageSize: 101 })).resolves.toMatchObject({
      meta: { page: 2, pageSize: 100, total: 0 },
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 100 }));
  });

  it('translates duplicate display names into RESOURCE_NAME_EXISTS', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.6.0',
      meta: { target: ['display_name'] },
    });
    const prisma = {
      resourceProfile: { create: jest.fn().mockRejectedValue(duplicate) },
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma);

    await expect(service.create({ displayName: '重复员工' })).rejects.toMatchObject({
      code: 'RESOURCE_NAME_EXISTS',
      statusCode: HttpStatus.CONFLICT,
    });
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
    const service = new EmployeesService(prisma);

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
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma);

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
  });

  it('soft-archives an active employee without load entries', async () => {
    const archivedAt = new Date('2026-07-23T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(archivedAt);
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(0) },
      resourceProfile: { update: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma);

    await service.archive('employee-1');

    expect(transactionClient.resourceProfile.update).toHaveBeenCalledWith({
      where: { id: 'employee-1' },
      data: { archivedAt },
    });
  });

  it('blocks archiving an employee with active resource load entries', async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee-1' }]),
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(1) },
      resourceProfile: { update: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
      ),
    } as unknown as PlatformPrismaService;
    const service = new EmployeesService(prisma);

    await expect(service.archive('employee-1')).rejects.toMatchObject({
      code: 'RESOURCE_LOAD_REFERENCE_INVALID',
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(transactionClient.resourceProfile.update).not.toHaveBeenCalled();
  });
});
