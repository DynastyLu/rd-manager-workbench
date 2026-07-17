import type { RequestContext } from '../../../../../src/shared/kernel/request-context';
import { CreateRoleUseCase } from '../../../../../src/modules/iam/role/application/create-role.use-case';
import { ListRolesUseCase } from '../../../../../src/modules/iam/role/application/list-roles.use-case';

describe('CreateRoleUseCase', () => {
  it('creates a tenant role using trusted tenant context', async () => {
    const roleRepository = {
      create: jest.fn(async (role) => role),
    };
    const useCase = new CreateRoleUseCase(roleRepository as never);
    const context: RequestContext = {
      traceId: 'trace-1',
      requestScope: 'tenant',
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      identitySource: 'trusted',
      provisional: {
        requestedScope: 'tenant',
        requestHeaders: {},
      },
    };

    const result = await useCase.execute(
      {
        name: 'Tenant Admin',
        key: 'tenant_admin',
      },
      context,
    );

    expect(result).toMatchObject({
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      name: 'Tenant Admin',
      key: 'tenant_admin',
    });
    expect(roleRepository.create).toHaveBeenCalledWith({
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      name: 'Tenant Admin',
      key: 'tenant_admin',
      description: undefined,
    });
  });

  it('lists roles only within the trusted tenant context', async () => {
    const roleRepository = {
      list: jest.fn(async (tenantId) => [{ tenantId, key: 'tenant_admin' }]),
    };
    const useCase = new ListRolesUseCase(roleRepository as never);
    const context: RequestContext = {
      traceId: 'trace-1',
      requestScope: 'tenant',
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      identitySource: 'trusted',
      provisional: {
        requestedScope: 'tenant',
        requestHeaders: {},
      },
    } as never;

    const roles = await useCase.execute(context as never);

    expect(roleRepository.list).toHaveBeenCalledWith('tenant_001');
    expect(roles).toEqual([{ tenantId: 'tenant_001', key: 'tenant_admin' }]);
  });
});
