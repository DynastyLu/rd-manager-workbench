import { HttpStatus, Logger } from '@nestjs/common';
import { SecurityAuditService } from '../../../../src/modules/iam/application/security-audit.service';
import { AdminUsersController } from '../../../../src/modules/iam/interface/http/admin-users.controller';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import type { AuthenticatedPrincipal } from '../../../../src/modules/iam/domain/principal';

describe('AdminUsersController conditional role assignment permission', () => {
  it('routes a missing role.assign permission through the audited denial path', async () => {
    const users = { update: jest.fn() };
    const authorization = { hasPermission: jest.fn().mockReturnValue(false) };
    const createAudit = jest.fn().mockRejectedValue(new Error('database unavailable'));
    const securityAudits = new SecurityAuditService({
      loginAudit: { create: createAudit },
    } as never);
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const controller = Reflect.construct(AdminUsersController, [
      users,
      authorization,
      securityAudits,
    ]) as AdminUsersController;
    const principal: AuthenticatedPrincipal = {
      userId: 'user-1',
      employeeId: 'employee-1',
      username: 'employee',
      sessionId: 'session-1',
      mustChangePassword: false,
      roleCodes: ['USER_EDITOR'],
      permissions: [
        {
          code: PERMISSIONS.USER_UPDATE,
          dataScope: 'ALL',
          scopeConfig: null,
        },
      ],
      permissionVersion: 1,
    };
    const request = {
      ip: '127.0.0.7',
      headers: { 'user-agent': 'admin-users-unit-agent' },
      socket: {},
    };

    const update = controller.update.bind(controller) as unknown as (
      userId: string,
      input: { roleIds: string[] },
      current: AuthenticatedPrincipal,
      request: unknown,
    ) => Promise<unknown>;
    await expect(
      update(
        'target-user',
        { roleIds: ['role-1'] },
        principal,
        request,
      ),
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      statusCode: HttpStatus.FORBIDDEN,
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: {
        userId: principal.userId,
        username: principal.username,
        eventType: 'PERMISSION_DENIED',
        success: false,
        failureReason: PERMISSIONS.ROLE_ASSIGN,
        ipAddress: '127.0.0.7',
        userAgent: 'admin-users-unit-agent',
        sessionId: principal.sessionId,
      },
    });
    expect(logger).toHaveBeenCalledWith(
      'Failed to persist a permission-denied security audit (Error)',
    );
    expect(users.update).not.toHaveBeenCalled();
    logger.mockRestore();
  });
});
