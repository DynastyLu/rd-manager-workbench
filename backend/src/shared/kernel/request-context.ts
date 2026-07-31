import type { AuthenticatedPrincipal } from '../../modules/iam/domain/principal';

export interface RequestContext {
  traceId: string;
  sourceIp?: string;
  requestHeaders: Record<string, string | string[] | undefined>;
  principal?: AuthenticatedPrincipal;
}
