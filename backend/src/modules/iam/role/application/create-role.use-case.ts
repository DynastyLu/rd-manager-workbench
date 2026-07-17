import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../../../../shared/kernel/request-context';
import { requireTrustedTenantContext } from '../../policy/application/require-trusted-tenant-context';
import type { RoleRepository } from '../domain/role.repository';

export interface CreateRoleInput {
  name: string;
  key: string;
  description?: string;
}

@Injectable()
export class CreateRoleUseCase {
  constructor(private readonly roleRepository: RoleRepository) {}

  async execute(input: CreateRoleInput, context: RequestContext) {
    const trustedContext = requireTrustedTenantContext(context);

    return this.roleRepository.create({
      tenantId: trustedContext.tenantId,
      tenantKey: trustedContext.tenantKey,
      name: input.name,
      key: input.key,
      description: input.description,
    });
  }
}
