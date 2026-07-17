import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../../shared/kernel/request-context';

export interface RequestContextInput {
  traceId?: string;
  sourceIp?: string;
  requestHeaders?: Record<string, string | string[] | undefined>;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  createContext(input: RequestContextInput = {}): RequestContext {
    return {
      traceId: input.traceId ?? randomUUID(),
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
