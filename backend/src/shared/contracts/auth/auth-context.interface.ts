import type { RequestContext } from '../../kernel/request-context';

export interface TrustedTenantIdentity {
  tenantId: string;
  tenantKey: string;
  tenantSchemaName?: string;
}

export interface TrustedOperatorIdentity {
  operatorId: string;
  operatorType: string;
}

export interface TrustedRequestIdentity {
  tenant?: TrustedTenantIdentity;
  operator?: TrustedOperatorIdentity;
  permissions?: string[];
}

export interface RequestContextIdentityResolver {
  resolve(
    context: RequestContext,
  ): TrustedRequestIdentity | Promise<TrustedRequestIdentity | undefined> | undefined;
}
