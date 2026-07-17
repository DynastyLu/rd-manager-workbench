import { Injectable } from '@nestjs/common';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { TenantStatus } from '../domain/tenant-status.enum';
import { TenantRepository } from '../domain/tenant.repository';

export interface CreateTenantInput {
  name: string;
  key: string;
}

@Injectable()
export class CreateTenantUseCase {
  constructor(private readonly tenantRepository: TenantRepository) {}

  async execute(input: CreateTenantInput) {
    const existingTenant = await this.tenantRepository.findByKey(input.key);
    if (existingTenant) {
      throw new AppError({
        code: ErrorCodes.TENANT_KEY_ALREADY_EXISTS,
        message: `Tenant key already exists: ${input.key}`,
        statusCode: 409,
        details: {
          tenantKey: input.key,
        },
      });
    }

    return this.tenantRepository.create({
      name: input.name,
      key: input.key,
      status: TenantStatus.PENDING,
    });
  }
}
