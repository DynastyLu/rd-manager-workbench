import { Injectable } from '@nestjs/common';
import {
  requireTrustedTenantContext,
  type TrustedTenantExecutionContext,
} from '../../policy/application/require-trusted-tenant-context';
import type { RoleRepository } from '../domain/role.repository';

@Injectable()
export class ListRolesUseCase {
  constructor(private readonly roleRepository: RoleRepository) {}

  async execute(context: TrustedTenantExecutionContext) {
    const trustedContext = requireTrustedTenantContext(context);
    return this.roleRepository.list(trustedContext.tenantId);
  }
}
