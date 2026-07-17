import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

import { RequestContextService } from '../../infrastructure/context/request-context.service'

interface SuccessResponse<T> {
  success: true
  data: T
  traceId: string
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  constructor(private readonly requestContext: RequestContextService) {}

  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T>> {
    return next
      .handle()
      .pipe(map((data) => ({ success: true, data, traceId: this.requestContext.getTraceId() })))
  }
}
