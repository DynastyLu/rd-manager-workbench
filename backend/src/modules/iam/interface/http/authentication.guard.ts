import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuthService } from '../../application/auth.service';
import {
  ALLOW_BEFORE_PASSWORD_CHANGE_KEY,
  PUBLIC_ROUTE_KEY,
} from './public.decorator';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const principal = await this.authService.authenticateBearer(request.headers.authorization);
    this.requestContext.setContext({ principal });

    const allowBeforePasswordChange =
      this.reflector.get<boolean>(ALLOW_BEFORE_PASSWORD_CHANGE_KEY, context.getHandler()) === true;
    if (principal.mustChangePassword && !allowBeforePasswordChange) {
      throw new AppError({
        code: ErrorCodes.AUTH_PASSWORD_CHANGE_REQUIRED,
        message: 'Password change is required before accessing business features',
        statusCode: HttpStatus.FORBIDDEN,
      });
    }
    return true;
  }
}
