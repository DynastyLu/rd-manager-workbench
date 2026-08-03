import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PermissionCode } from '../../../../iam/domain/permission-catalog';
import { EmployeeImportAccessService } from '../../application/employee-import-access.service';

export const EMPLOYEE_IMPORT_ALL_SCOPE_PERMISSION_KEY =
  'employee-imports.required-all-scope-permission';

@Injectable()
export class EmployeeImportAllScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: EmployeeImportAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionCode = this.reflector.getAllAndOverride<PermissionCode>(
      EMPLOYEE_IMPORT_ALL_SCOPE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissionCode) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const userAgent = request.headers?.['user-agent'];
    await this.access.assertAll(permissionCode, {
      ipAddress: request.ip || request.socket?.remoteAddress,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
    return true;
  }
}

export const RequireEmployeeImportAllScope = (
  permissionCode: PermissionCode,
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(EMPLOYEE_IMPORT_ALL_SCOPE_PERMISSION_KEY, permissionCode),
    UseGuards(EmployeeImportAllScopeGuard),
  );
