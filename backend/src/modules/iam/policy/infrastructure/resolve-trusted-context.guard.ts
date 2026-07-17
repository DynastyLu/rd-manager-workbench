import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { TrustedTenantContextResolver } from './trusted-tenant-context.resolver';
import { Request } from 'express';
import { RequestContext } from '../../../../shared/kernel/request-context';

@Injectable()
export class ResolveTrustedContextGuard implements CanActivate {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly trustedTenantContextResolver: TrustedTenantContextResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { requestContext?: RequestContext }>();
    const liveContext = request.requestContext ?? this.requestContextService.requireContext();

    if (liveContext.requestScope === 'platform') {
      request.requestContext = liveContext;
      return true;
    }

    if (liveContext.identitySource === 'trusted') {
      request.requestContext = liveContext;
      return true;
    }

    const resolvedContext = await this.trustedTenantContextResolver.attach(liveContext);
    if (resolvedContext.identitySource !== 'trusted') {
      throw new AppError({
        code: ErrorCodes.TENANT_CONTEXT_REQUIRED,
        message: 'Tenant context could not be resolved',
        details: {
          requestedScope: resolvedContext.provisional.requestedScope,
        },
      });
    }

    request.requestContext = resolvedContext;
    return true;
  }
}
