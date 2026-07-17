import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { RequestContextService } from '../../infrastructure/context/request-context.service';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly requestContextService: RequestContextService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        traceId: this.requestContextService.getContext()?.traceId,
        data,
      })),
    );
  }
}
