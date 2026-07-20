import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, catchError, concatMap, from, of, throwError } from 'rxjs';
import { RequestContextService } from '../../infrastructure/context/request-context.service';
import { AuditLogService } from '../../modules/workbench/governance/application/audit-log.service';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditLogService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request || !writeMethods.has(request.method)) return next.handle();
    const auditInput = this.describe(request);
    return next.handle().pipe(
      concatMap((result) =>
        from(
          this.audit.record({
            ...auditInput,
            outcome: 'SUCCEEDED',
            traceId: this.requestContext.getContext()?.traceId,
          }).catch((error: unknown) => {
            // The handler may already have committed its transaction. Returning an
            // error here would invite a retry and can duplicate the business write.
            // Strongly consistent domain audits are written inside their service
            // transaction; this global fallback is deliberately best-effort.
            this.logger.error(
              'Post-commit audit persistence failed',
              error instanceof Error ? error.stack : undefined,
            );
          }),
        ).pipe(concatMap(() => of(result))),
      ),
      catchError((error: unknown) =>
        from(
          this.audit
            .record({
              ...auditInput,
              outcome: 'FAILED',
              metadata: {
                ...auditInput.metadata,
                errorCode: this.errorCode(error),
              },
              traceId: this.requestContext.getContext()?.traceId,
            })
            .catch(() => undefined),
        ).pipe(concatMap(() => throwError(() => error))),
      ),
    );
  }

  private describe(request: Request) {
    const routeTemplate = `${request.baseUrl || ''}${request.route?.path || request.path}`;
    const parts = request.path.split('/').filter(Boolean);
    const rawEntityId = request.params?.id;
    return {
      action: `${request.method}_${parts[1] || parts[0] || 'ROOT'}`.toUpperCase(),
      entityType: parts[1] || parts[0] || 'unknown',
      entityId: Array.isArray(rawEntityId) ? rawEntityId[0] : rawEntityId,
      changedFields: this.bodyFieldNames(request.body),
      metadata: { method: request.method, routeTemplate },
    };
  }

  private bodyFieldNames(body: unknown): string[] {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
    return Object.keys(body as Record<string, unknown>);
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
    return 'INTERNAL_ERROR';
  }
}
