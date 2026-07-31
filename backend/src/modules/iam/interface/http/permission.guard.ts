import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { AuthorizationService } from '../../application/authorization.service';
import { SecurityAuditService } from '../../application/security-audit.service';
import type { PermissionCode } from '../../domain/permission-catalog';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
    private readonly requestContext: RequestContextService,
    private readonly securityAudits: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndMerge<PermissionCode[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;

    const principal = this.requestContext.requirePrincipal();
    if (required.every((permission) => this.authorization.hasPermission(principal, permission))) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const requiredPermissions = [...new Set(required)];
    const userAgent = request.headers?.['user-agent'];
    return this.securityAudits.denyPermission(principal, requiredPermissions, {
      ipAddress: request.ip || request.socket?.remoteAddress,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }
}
