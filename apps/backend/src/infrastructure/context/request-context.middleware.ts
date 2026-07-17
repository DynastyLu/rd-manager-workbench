import { randomUUID } from 'node:crypto'

import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { RequestContextService } from './request-context.service'

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    this.requestContext.run(
      {
        traceId: randomUUID(),
        sourceIp: request.ip || request.socket.remoteAddress || 'unknown',
        startedAt: Date.now(),
      },
      next,
    )
  }
}
