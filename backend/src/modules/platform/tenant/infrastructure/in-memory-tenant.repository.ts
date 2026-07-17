import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { TenantPrismaManagerService } from '../../../../infrastructure/prisma/tenant-prisma-manager.service';
import { Tenant } from '../domain/tenant.entity';
import { TenantRepository } from '../domain/tenant.repository';

@Injectable()
export class InMemoryTenantRepository implements TenantRepository {
  constructor(private readonly tenantPrismaManagerService: TenantPrismaManagerService) {}

  private readonly tenants = new Map<string, Tenant>();

  async create(input: Omit<Tenant, 'id' | 'createdAt' | 'schemaName'>): Promise<Tenant> {
    if (this.tenants.has(input.key)) {
      throw new AppError({
        code: ErrorCodes.TENANT_KEY_ALREADY_EXISTS,
        message: `Tenant key already exists: ${input.key}`,
        statusCode: 409,
        details: {
          tenantKey: input.key,
        },
      });
    }

    const databaseTarget = this.tenantPrismaManagerService.resolveTenantDatabaseTarget({
      tenantKey: input.key,
    });

    const tenant: Tenant = {
      ...input,
      schemaName: databaseTarget.schemaName,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.tenants.set(tenant.key, tenant);
    return tenant;
  }

  async list(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }

  async findByKey(key: string): Promise<Tenant | undefined> {
    return this.tenants.get(key);
  }
}
