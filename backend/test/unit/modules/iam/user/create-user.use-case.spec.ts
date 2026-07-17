import type { RequestContext } from '../../../../../src/shared/kernel/request-context';
import { CreateUserUseCase } from '../../../../../src/modules/iam/user/application/create-user.use-case';
import { ListUsersUseCase } from '../../../../../src/modules/iam/user/application/list-users.use-case';

describe('CreateUserUseCase', () => {
  it('creates a tenant user using trusted tenant context', async () => {
    const userRepository = {
      create: jest.fn(async (user) => user),
    };
    const useCase = new CreateUserUseCase(userRepository as never);
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
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        roleKeys: ['tenant_admin'],
      },
      context,
    );

    expect(result).toMatchObject({
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      roleKeys: ['tenant_admin'],
    });
    expect(userRepository.create).toHaveBeenCalledWith({
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      roleKeys: ['tenant_admin'],
    });
  });

  it('lists users only within the trusted tenant context', async () => {
    const userRepository = {
      list: jest.fn(async (tenantId) => [
        { tenantId, email: 'ada@example.com' },
      ]),
    };
    const useCase = new ListUsersUseCase(userRepository as never);
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

    const users = await useCase.execute(context as never);

    expect(userRepository.list).toHaveBeenCalledWith('tenant_001');
    expect(users).toEqual([{ tenantId: 'tenant_001', email: 'ada@example.com' }]);
  });

  it('rejects provisional context without trusted tenant identity', async () => {
    const userRepository = {
      create: jest.fn(),
    };
    const useCase = new CreateUserUseCase(userRepository as never);
    const context: RequestContext = {
      traceId: 'trace-1',
      requestScope: 'tenant',
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      identitySource: 'provisional',
      provisional: {
        requestedScope: 'tenant',
        requestHeaders: {},
      },
    };

    await expect(
      useCase.execute(
        {
          email: 'ada@example.com',
          displayName: 'Ada Lovelace',
        },
        context,
      ),
    ).rejects.toThrow('Tenant context must be trusted before this operation');
    expect(userRepository.create).not.toHaveBeenCalled();
  });
});
