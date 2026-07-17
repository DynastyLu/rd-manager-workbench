import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error';
import { ErrorCodes } from '../../shared/errors/error-codes';
import type {
  RequestContext,
  RequestTransportMetadata,
} from '../../shared/kernel/request-context';
import type { RequestScope } from '../../shared/kernel/request-scope';
import { isRequestScope } from '../../shared/kernel/request-scope';
import type { TrustedRequestIdentity } from '../../shared/contracts/auth/auth-context.interface';

export interface RequestContextInput {
  traceId?: string;
  requestedScope?: RequestScope | string;
  rawTenantId?: string;
  rawTenantKey?: string;
  rawOperatorId?: string;
  rawOperatorType?: string;
  sourceIp?: string;
  requestHeaders?: Record<string, string | string[] | undefined>;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  createContext(input: RequestContextInput = {}): RequestContext {
    const traceId = input.traceId ?? randomUUID();
    const provisional = this.buildTransportMetadata(input);
    const hasTenantTransportIdentity =
      provisional.requestedScope === 'tenant' &&
      Boolean(provisional.rawTenantId && provisional.rawTenantKey);

    return {
      traceId,
      requestScope: hasTenantTransportIdentity ? 'tenant' : 'platform',
      tenantId: hasTenantTransportIdentity ? provisional.rawTenantId : undefined,
      tenantKey: hasTenantTransportIdentity ? provisional.rawTenantKey : undefined,
      operatorId: hasTenantTransportIdentity ? provisional.rawOperatorId : undefined,
      operatorType: hasTenantTransportIdentity ? provisional.rawOperatorType : undefined,
      identitySource: 'provisional',
      provisional,
    };
  }

  attachTrustedIdentity(
    context: RequestContext,
    trustedIdentity: TrustedRequestIdentity,
  ): RequestContext {
    // Mutate the existing context object so ALS and request-attached state stay aligned.
    const next = context;
    next.trustedIdentity = trustedIdentity;

    if (trustedIdentity.tenant) {
      next.requestScope = 'tenant';
      next.tenantId = trustedIdentity.tenant.tenantId;
      next.tenantKey = trustedIdentity.tenant.tenantKey;
      next.identitySource = 'trusted';
    }

    if (trustedIdentity.operator) {
      next.operatorId = trustedIdentity.operator.operatorId;
      next.operatorType = trustedIdentity.operator.operatorType;
    }

    this.storage.enterWith(next);
    return next;
  }

  private parseRequestScope(requestedScope: RequestScope | string): RequestScope {
    if (!isRequestScope(requestedScope)) {
      throw new AppError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: `Invalid request scope: ${requestedScope}`,
        details: {
          requestedScope,
        },
      });
    }

    return requestedScope;
  }

  private buildTransportMetadata(input: RequestContextInput): RequestTransportMetadata {
    const requestedScope =
      input.requestedScope === undefined ? undefined : this.parseRequestScope(input.requestedScope);

    return {
      requestedScope,
      rawTenantId: input.rawTenantId,
      rawTenantKey: input.rawTenantKey,
      rawOperatorId: input.rawOperatorId,
      rawOperatorType: input.rawOperatorType,
      sourceIp: input.sourceIp,
      requestHeaders: input.requestHeaders ?? {},
    };
  }

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  requireContext(): RequestContext {
    const context = this.getContext();
    if (!context) {
      throw new Error('Request context is not available');
    }

    return context;
  }

  setContext(patch: Partial<RequestContext>): RequestContext {
    const current = this.requireContext();
    Object.assign(current, patch);
    this.storage.enterWith(current);
    return current;
  }
}
