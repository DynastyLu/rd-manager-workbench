import { Inject, Injectable } from '@nestjs/common';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { TENANT_REPOSITORY, type TenantRepository } from '../../../platform/tenant/domain/tenant.repository';
import type { RequestContextIdentityResolver, TrustedRequestIdentity } from '../../../../shared/contracts/auth/auth-context.interface';
import type { RequestContext } from '../../../../shared/kernel/request-context';

@Injectable()
export class TrustedTenantContextResolver implements RequestContextIdentityResolver {
  constructor(
    private readonly requestContextService: RequestContextService,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepository: TenantRepository,
  ) {}

  async resolve(context: RequestContext): Promise<TrustedRequestIdentity | undefined> {
    if (context.requestScope !== 'tenant') {
      return undefined;
    }

    const tenantId = context.tenantId;
    const tenantKey = context.tenantKey;

    if (!tenantId || !tenantKey) {
      return undefined;
    }

    const tenant = await this.tenantRepository.findByKey(tenantKey);
    if (!tenant || tenant.id !== tenantId || tenant.key !== tenantKey) {
      return undefined;
    }

    const trustedIdentity: TrustedRequestIdentity = {
      tenant: {
        tenantId: tenant.id,
        tenantKey: tenant.key,
        tenantSchemaName: tenant.schemaName,
      },
    };

    if (context.operatorId) {
      trustedIdentity.operator = {
        operatorId: context.operatorId,
        operatorType: context.operatorType ?? 'unknown',
      };
    }

    return trustedIdentity;
  }

  async attach(context: RequestContext): Promise<RequestContext> {
    const trustedIdentity = await this.resolve(context);
    if (!trustedIdentity) {
      return context;
    }

    return this.requestContextService.attachTrustedIdentity(context, trustedIdentity);
  }
}
