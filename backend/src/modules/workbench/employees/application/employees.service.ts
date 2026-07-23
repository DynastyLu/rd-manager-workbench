import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from '../interface/http/dto/employees.dto';

const orderedSkills = { skills: { orderBy: { name: 'asc' as const } } };

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async list(query: ListEmployeesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ResourceProfileWhereInput = {
      archivedAt: null,
      ...(query.department ? { department: query.department } : {}),
      ...(query.employmentStatus ? { employmentStatus: query.employmentStatus } : {}),
      ...(query.q
        ? {
            OR: [
              { displayName: { contains: query.q, mode: 'insensitive' } },
              { roleTitle: { contains: query.q, mode: 'insensitive' } },
              { department: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
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
      this.throwDuplicateName(error);
      throw error;
    }
  }

  async get(id: string) {
    const employee = await this.prisma.resourceProfile.findFirst({
      where: { id, archivedAt: null },
      include: {
        skills: { orderBy: { name: 'asc' } },
        loadEntries: {
          where: { archivedAt: null },
          orderBy: { weekStartAt: 'desc' },
        },
      },
    });
    if (!employee) {
      throw this.notFound();
    }
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.get(id);
    try {
      return await this.prisma.resourceProfile.update({
        where: { id },
        data: dto,
        include: orderedSkills,
      });
    } catch (error) {
      this.throwDuplicateName(error);
      throw error;
    }
  }

  async archive(id: string) {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockActiveEmployee(transaction, id);
      const activeLoadEntryCount = await transaction.resourceLoadEntry.count({
        where: { resourceId: id, archivedAt: null },
      });
      if (activeLoadEntryCount > 0) {
        throw new AppError({
          code: ErrorCodes.RESOURCE_LOAD_REFERENCE_INVALID,
          message: 'Archive load entries before archiving resource',
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        });
      }
      await transaction.resourceProfile.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
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

  private throwDuplicateName(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        code: ErrorCodes.RESOURCE_NAME_EXISTS,
        message: 'Resource name already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private notFound() {
    return new AppError({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      message: 'Resource not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
