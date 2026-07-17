import type { TrustedRequestIdentity } from '../contracts/auth/auth-context.interface';
import type { RequestScope } from './request-scope';

export interface RequestTransportMetadata {
  requestedScope?: RequestScope;
  rawTenantId?: string;
  rawTenantKey?: string;
  rawOperatorId?: string;
  rawOperatorType?: string;
  sourceIp?: string;
  requestHeaders: Record<string, string | string[] | undefined>;
}

export interface RequestContext {
  traceId: string;
  requestScope: RequestScope;
  tenantId?: string;
  tenantKey?: string;
  operatorId?: string;
  operatorType?: string;
  identitySource: 'provisional' | 'trusted';
  provisional: RequestTransportMetadata;
  trustedIdentity?: TrustedRequestIdentity;
}
