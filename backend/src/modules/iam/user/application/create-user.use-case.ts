import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../../../../shared/kernel/request-context';
import { requireTrustedTenantContext } from '../../policy/application/require-trusted-tenant-context';
import type { UserRepository } from '../domain/user.repository';

export interface CreateUserInput {
  email: string;
  displayName: string;
  roleKeys?: string[];
}

@Injectable()
export class CreateUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: CreateUserInput, context: RequestContext) {
    const trustedContext = requireTrustedTenantContext(context);

    return this.userRepository.create({
      tenantId: trustedContext.tenantId,
      tenantKey: trustedContext.tenantKey,
      email: input.email,
      displayName: input.displayName,
      roleKeys: input.roleKeys ?? [],
    });
  }
}
