import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { AuthorizationService } from '../../../../src/modules/iam/application/authorization.service';
import { SecurityAuditService } from '../../../../src/modules/iam/application/security-audit.service';
import { AuthenticatedPrincipal } from '../../../../src/modules/iam/domain/principal';
import {
  PERMISSIONS,
  RequirePermissions,
  REQUIRED_PERMISSIONS_KEY,
} from '../../../../src/modules/iam/interface/http/permissions.decorator';
import { PermissionGuard } from '../../../../src/modules/iam/interface/http/permission.guard';

const employee: AuthenticatedPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'employee',
  sessionId: 'session-1',
  mustChangePassword: false,
  roleCodes: ['EMPLOYEE'],
  permissions: [
    {
      code: PERMISSIONS.EMPLOYEE_READ,
      dataScope: 'DEPARTMENT',
      scopeConfig: { departmentNames: ['研发部', '测试部'] },
    },
    {
      code: PERMISSIONS.EMPLOYEE_READ,
      dataScope: 'DEPARTMENT',
      scopeConfig: { departmentNames: ['测试部', '产品部'] },
    },
    {
      code: PERMISSIONS.EMPLOYEE_READ,
      dataScope: 'PROJECT',
      scopeConfig: { projectIds: ['project-a'] },
    },
    {
      code: PERMISSIONS.EMPLOYEE_READ,
      dataScope: 'PROJECT',
      scopeConfig: { projectIds: ['project-b', 'project-a'] },
    },
    {
      code: PERMISSIONS.PROJECT_READ,
      dataScope: 'INVOLVED',
      scopeConfig: null,
    },
  ],
  permissionVersion: 2,
};

const superAdmin: AuthenticatedPrincipal = {
  ...employee,
  userId: 'admin-1',
  employeeId: 'employee-admin',
  username: 'admin',
  roleCodes: ['SUPER_ADMIN'],
  permissions: [],
};

describe('AuthorizationService', () => {
  const service = new AuthorizationService();

  it('lets SUPER_ADMIN safely bypass enumerated grants and resolves ALL data', () => {
    expect(service.hasPermission(superAdmin, PERMISSIONS.PROJECT_DELETE)).toBe(true);
    expect(service.resolveScope(superAdmin, PERMISSIONS.PROJECT_DELETE)).toEqual({
      kinds: ['ALL'],
    });
  });

  it('denies a permission that is not granted to an ordinary user', () => {
    expect(service.hasPermission(employee, PERMISSIONS.PROJECT_DELETE)).toBe(false);
    expect(service.resolveScope(employee, PERMISSIONS.PROJECT_DELETE)).toEqual({
      kinds: [],
    });
  });

  it('unions multiple grants without collapsing department and project scopes', () => {
    expect(service.resolveScope(employee, PERMISSIONS.EMPLOYEE_READ)).toEqual({
      kinds: ['DEPARTMENT', 'PROJECT'],
      departmentNames: ['产品部', '测试部', '研发部'],
      projectIds: ['project-a', 'project-b'],
    });
  });
});

describe('RequirePermissions and PermissionGuard', () => {
  class ProtectedController {
    @RequirePermissions(PERMISSIONS.ROLE_READ, PERMISSIONS.ROLE_UPDATE)
    updateRole() {}

    openToAuthenticatedUsers() {}
  }

  it('stores stable permission metadata on a handler', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, ProtectedController.prototype.updateRole),
    ).toEqual([PERMISSIONS.ROLE_READ, PERMISSIONS.ROLE_UPDATE]);
  });

  it('allows authenticated handlers with no declared permission', () => {
    const { guard, context } = permissionGuard(employee);
    return context.run(context.createContext(), async () => {
      context.setContext({ principal: employee });
      await expect(
        guard.canActivate(executionContext(ProtectedController.prototype.openToAuthenticatedUsers)),
      ).resolves.toBe(true);
    });
  });

  it('rejects a handler when any required permission is missing', () => {
    const { guard, context } = permissionGuard(employee);
    return context.run(context.createContext(), async () => {
      context.setContext({ principal: employee });
      await expect(
        guard.canActivate(executionContext(ProtectedController.prototype.updateRole)),
      ).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 403,
      });
    });
  });

  it('keeps the stable 403 denial when its best-effort audit write fails', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { guard, context, createAudit } = permissionGuard(employee, true);
    return context.run(context.createContext(), async () => {
      context.setContext({ principal: employee });
      await expect(
        guard.canActivate(executionContext(ProtectedController.prototype.updateRole)),
      ).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 403,
      });
      expect(createAudit).toHaveBeenCalledTimes(1);
      expect(logger).toHaveBeenCalledWith(
        'Failed to persist a permission-denied security audit (Error)',
      );
      logger.mockRestore();
    });
  });

  it('allows SUPER_ADMIN without enumerating every permission', () => {
    const { guard, context } = permissionGuard(superAdmin);
    return context.run(context.createContext(), async () => {
      context.setContext({ principal: superAdmin });
      await expect(
        guard.canActivate(executionContext(ProtectedController.prototype.updateRole)),
      ).resolves.toBe(true);
    });
  });
});

function permissionGuard(principal: AuthenticatedPrincipal, auditRejects = false) {
  const context = new RequestContextService();
  const authorization = new AuthorizationService();
  const createAudit = jest.fn(
    auditRejects
      ? () => Promise.reject(new Error('database unavailable'))
      : () => Promise.resolve(undefined),
  );
  const securityAudits = new SecurityAuditService({
    loginAudit: { create: createAudit },
  } as never);
  const guard = new PermissionGuard(
    new Reflector(),
    authorization,
    context,
    securityAudits,
  );
  return { guard, context, principal, createAudit };
}

function executionContext(handler: (...args: never[]) => unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ProtectedFixture,
    switchToHttp: () =>
      ({
        getRequest: () => ({}),
      }) as ReturnType<ExecutionContext['switchToHttp']>,
  } as unknown as ExecutionContext;
}

class ProtectedFixture {}
