import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

export interface RequestContext {
  traceId: string
  sourceIp: string
  startedAt: number
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<Readonly<RequestContext>>()

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(Object.freeze({ ...context }), callback)
  }

  get(): Readonly<RequestContext> | undefined {
    return this.storage.getStore()
  }

  getTraceId(): string {
    return this.get()?.traceId ?? randomUUID()
  }
}
