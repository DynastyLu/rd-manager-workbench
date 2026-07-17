import { Injectable } from '@nestjs/common';
import {
  requireTrustedTenantContext,
  type TrustedTenantExecutionContext,
} from '../../policy/application/require-trusted-tenant-context';
import type { UserRepository } from '../domain/user.repository';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(context: TrustedTenantExecutionContext) {
    const trustedContext = requireTrustedTenantContext(context);
    return this.userRepository.list(trustedContext.tenantId);
  }
}
