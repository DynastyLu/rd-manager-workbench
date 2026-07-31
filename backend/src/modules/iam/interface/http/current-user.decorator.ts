import { createParamDecorator, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedPrincipal } from '../../domain/principal';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import type { RequestContext } from '../../../../shared/kernel/request-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { requestContext?: RequestContext }>();
    const principal = request.requestContext?.principal;
    if (!principal) {
      throw new AppError({
        code: ErrorCodes.AUTH_REQUIRED,
        message: 'Authentication required',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }
    return principal;
  },
);
