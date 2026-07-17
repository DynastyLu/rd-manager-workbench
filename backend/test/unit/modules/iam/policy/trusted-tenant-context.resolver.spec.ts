import { RequestContextService } from '../../../../../src/infrastructure/context/request-context.service';
import { TrustedTenantContextResolver } from '../../../../../src/modules/iam/policy/infrastructure/trusted-tenant-context.resolver';

describe('TrustedTenantContextResolver', () => {
  it('promotes only matching tenant id and key from the repository boundary', async () => {
    const tenantRepository = {
      findByKey: jest.fn(async (key) =>
        key === 'acme'
          ? {
              id: 'tenant_001',
              key: 'acme',
              schemaName: 'tenant_acme_deadbeef',
            }
          : undefined,
      ),
    };
    const resolver = new TrustedTenantContextResolver(
      new RequestContextService(),
      tenantRepository as never,
    );

    await expect(
      resolver.resolve({
        traceId: 'trace-1',
        requestScope: 'tenant',
        tenantId: 'tenant_001',
        tenantKey: 'acme',
        identitySource: 'provisional',
        provisional: {
          requestedScope: 'tenant',
          requestHeaders: {},
        },
      } as never),
    ).resolves.toMatchObject({
      tenant: {
        tenantId: 'tenant_001',
        tenantKey: 'acme',
        tenantSchemaName: 'tenant_acme_deadbeef',
      },
    });
  });

  it('rejects mismatched tenant id and key pairs', async () => {
    const tenantRepository = {
      findByKey: jest.fn(async () => ({
        id: 'tenant_001',
        key: 'acme',
        schemaName: 'tenant_acme_deadbeef',
      })),
    };
    const resolver = new TrustedTenantContextResolver(
      new RequestContextService(),
      tenantRepository as never,
    );

    await expect(
      resolver.resolve({
        traceId: 'trace-1',
        requestScope: 'tenant',
        tenantId: 'tenant_002',
        tenantKey: 'acme',
        identitySource: 'provisional',
        provisional: {
          requestedScope: 'tenant',
          requestHeaders: {},
        },
      } as never),
    ).resolves.toBeUndefined();
  });
});
