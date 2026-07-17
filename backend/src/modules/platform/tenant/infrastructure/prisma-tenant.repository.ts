import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { TenantPrismaManagerService } from '../../../../infrastructure/prisma/tenant-prisma-manager.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { Tenant } from '../domain/tenant.entity';
import { TenantRepository } from '../domain/tenant.repository';

type TenantRecord = {
  id: string;
  name: string;
  key: string;
  schemaName: string;
  status: string;
  createdAt: Date;
};

@Injectable()
export class PrismaTenantRepository implements TenantRepository {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly tenantPrismaManagerService: TenantPrismaManagerService,
  ) {}

  async create(input: Omit<Tenant, 'id' | 'createdAt' | 'schemaName'>): Promise<Tenant> {
    const databaseTarget = this.tenantPrismaManagerService.resolveTenantDatabaseTarget({
      tenantKey: input.key,
    });

    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          name: input.name,
          key: input.key,
          schemaName: databaseTarget.schemaName,
          status: input.status,
        },
      });
      return this.toEntity(tenant);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new AppError({
          code: ErrorCodes.TENANT_KEY_ALREADY_EXISTS,
          message: `Tenant key already exists: ${input.key}`,
          statusCode: 409,
          details: {
            tenantKey: input.key,
          },
        });
      }
      throw error;
    }
  }

  async list(): Promise<Tenant[]> {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return tenants.map((tenant) => this.toEntity(tenant));
  }

  async findByKey(key: string): Promise<Tenant | undefined> {
    const tenant = await this.prisma.tenant.findUnique({ where: { key } });
    return tenant ? this.toEntity(tenant) : undefined;
  }

  private toEntity(tenant: TenantRecord): Tenant {
    return {
      id: tenant.id,
      name: tenant.name,
      key: tenant.key,
      schemaName: tenant.schemaName,
      status: tenant.status as Tenant['status'],
      createdAt: tenant.createdAt.toISOString(),
    };
  }

  private isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
