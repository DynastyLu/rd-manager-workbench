import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import type { RequestContext } from '../../../../shared/kernel/request-context';

export interface TrustedTenantExecutionContext extends RequestContext {
  requestScope: 'tenant';
  identitySource: 'trusted';
  tenantId: string;
  tenantKey: string;
}

export function requireTrustedTenantContext(
  context: RequestContext,
): TrustedTenantExecutionContext {
  if (
    context.requestScope !== 'tenant' ||
    context.identitySource !== 'trusted' ||
    !context.tenantId ||
    !context.tenantKey
  ) {
    throw new AppError({
      code: ErrorCodes.TENANT_CONTEXT_REQUIRED,
      message: 'Tenant context must be trusted before this operation',
      details: {
        requestScope: context.requestScope,
        identitySource: context.identitySource,
      },
    });
  }

  return context as TrustedTenantExecutionContext;
}
