import { Injectable } from '@nestjs/common';
import { TenantRepository } from '../domain/tenant.repository';

@Injectable()
export class ListTenantsUseCase {
  constructor(private readonly tenantRepository: TenantRepository) {}

  async execute() {
    return this.tenantRepository.list();
  }
}
