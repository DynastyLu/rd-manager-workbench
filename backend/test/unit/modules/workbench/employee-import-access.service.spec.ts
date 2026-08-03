import { HttpStatus } from '@nestjs/common';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { AuthorizationService } from '../../../../src/modules/iam/application/authorization.service';
import { SecurityAuditService } from '../../../../src/modules/iam/application/security-audit.service';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import type { AuthenticatedPrincipal } from '../../../../src/modules/iam/domain/principal';
import { REQUIRED_PERMISSIONS_KEY } from '../../../../src/modules/iam/interface/http/permissions.decorator';
import { EmployeeImportAccessService } from '../../../../src/modules/workbench/employees/application/employee-import-access.service';
import { EMPLOYEE_IMPORT_ALL_SCOPE_PERMISSION_KEY } from '../../../../src/modules/workbench/employees/interface/http/employee-import-all-scope.guard';
import { EmployeeImportsController } from '../../../../src/modules/workbench/employees/interface/http/employee-imports.controller';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';

describe('EmployeeImportAccessService', () => {
  const authorization = new AuthorizationService();
  let principal: AuthenticatedPrincipal;
  const requestContext = {
    requirePrincipal: jest.fn(() => principal),
  } as unknown as RequestContextService;
  const denyPermission = jest.fn();
  const securityAudits = { denyPermission } as unknown as SecurityAuditService;
  const service = new EmployeeImportAccessService(requestContext, authorization, securityAudits);

  beforeEach(() => {
    principal = createPrincipal();
    jest.clearAllMocks();
    denyPermission.mockRejectedValue(
      Object.assign(new Error('Permission denied'), {
        code: ErrorCodes.PERMISSION_DENIED,
        statusCode: HttpStatus.FORBIDDEN,
        details: { requiredPermissions: [PERMISSIONS.EMPLOYEE_UPDATE] },
      }),
    );
  });

  it.each([
    ['without a grant', []],
    [
      'with SELF scope',
      [{ code: PERMISSIONS.EMPLOYEE_UPDATE, dataScope: 'SELF' as const, scopeConfig: null }],
    ],
    [
      'with INVOLVED scope',
      [{ code: PERMISSIONS.EMPLOYEE_UPDATE, dataScope: 'INVOLVED' as const, scopeConfig: null }],
    ],
  ])('denies and audits batch mutation %s', async (_label, permissions) => {
    principal = { ...principal, permissions };

    await expect(
      service.assertAll(PERMISSIONS.EMPLOYEE_UPDATE, {
        ipAddress: '127.0.0.7',
        userAgent: 'employee-import-unit-agent',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: ErrorCodes.PERMISSION_DENIED,
        statusCode: HttpStatus.FORBIDDEN,
      }),
    );
    expect(denyPermission).toHaveBeenCalledWith(
      principal,
      [PERMISSIONS.EMPLOYEE_UPDATE],
      {
        ipAddress: '127.0.0.7',
        userAgent: 'employee-import-unit-agent',
      },
    );
  });

  it('allows a grant whose scope contains ALL without writing a denial audit', async () => {
    principal = {
      ...principal,
      permissions: [
        { code: PERMISSIONS.EMPLOYEE_READ, dataScope: 'SELF', scopeConfig: null },
        { code: PERMISSIONS.EMPLOYEE_READ, dataScope: 'ALL', scopeConfig: null },
      ],
    };

    await expect(service.assertAll(PERMISSIONS.EMPLOYEE_READ, {})).resolves.toBeUndefined();
    expect(denyPermission).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN without an explicit grant', async () => {
    principal = { ...principal, roleCodes: ['SUPER_ADMIN'] };

    await expect(service.assertAll(PERMISSIONS.EMPLOYEE_DELETE, {})).resolves.toBeUndefined();
    expect(denyPermission).not.toHaveBeenCalled();
  });
});

describe('EmployeeImportsController permission metadata', () => {
  const allScopeEndpoints = {
    list: PERMISSIONS.EMPLOYEE_READ,
    get: PERMISSIONS.EMPLOYEE_READ,
    errors: PERMISSIONS.EMPLOYEE_READ,
    source: PERMISSIONS.EMPLOYEE_READ,
    upload: PERMISSIONS.EMPLOYEE_UPDATE,
    preview: PERMISSIONS.EMPLOYEE_UPDATE,
    resolve: PERMISSIONS.EMPLOYEE_UPDATE,
    commit: PERMISSIONS.EMPLOYEE_UPDATE,
    rebuildSnapshots: PERMISSIONS.EMPLOYEE_UPDATE,
    restore: PERMISSIONS.EMPLOYEE_UPDATE,
    remove: PERMISSIONS.EMPLOYEE_DELETE,
  } as const;

  it.each(Object.entries(allScopeEndpoints))(
    'requires %s permission code and matching ALL scope',
    (methodName, permissionCode) => {
      const handler = EmployeeImportsController.prototype[
        methodName as keyof typeof allScopeEndpoints
      ];

      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toContain(permissionCode);
      expect(Reflect.getMetadata(EMPLOYEE_IMPORT_ALL_SCOPE_PERMISSION_KEY, handler)).toBe(
        permissionCode,
      );
    },
  );

  it('protects template with employee.read without requiring organization-wide scope', () => {
    const handler = EmployeeImportsController.prototype.template;

    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toContain(
      PERMISSIONS.EMPLOYEE_READ,
    );
    expect(Reflect.getMetadata(EMPLOYEE_IMPORT_ALL_SCOPE_PERMISSION_KEY, handler)).toBeUndefined();
  });
});

function createPrincipal(): AuthenticatedPrincipal {
  return {
    userId: 'user-1',
    employeeId: 'employee-1',
    username: 'employee',
    sessionId: 'session-1',
    mustChangePassword: false,
    roleCodes: ['EMPLOYEE'],
    permissions: [],
    permissionVersion: 1,
  };
}
