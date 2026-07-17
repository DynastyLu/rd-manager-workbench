import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';

describe('RequestContextService', () => {
  it('initializes a tenant-scoped provisional context when tenant transport metadata is complete', async () => {
    const service = new RequestContextService();
    const context = service.createContext({
      requestedScope: 'tenant',
      rawTenantId: 'tenant_01',
      rawTenantKey: 'Acme Corp',
      rawOperatorId: 'operator_01',
      rawOperatorType: 'tenant_admin',
      requestHeaders: {
        'x-tenant-id': 'tenant_01',
      },
    });

    await service.run(context, async () => {
      expect(service.getContext()).toMatchObject({
        requestScope: 'tenant',
        tenantId: 'tenant_01',
        tenantKey: 'Acme Corp',
        operatorId: 'operator_01',
        operatorType: 'tenant_admin',
        identitySource: 'provisional',
        provisional: {
          requestedScope: 'tenant',
          rawTenantId: 'tenant_01',
          rawTenantKey: 'Acme Corp',
          rawOperatorId: 'operator_01',
          rawOperatorType: 'tenant_admin',
        },
      });
    });
  });

  it('allows trusted identity to be attached later by a resolver', () => {
    const service = new RequestContextService();
    const provisional = service.createContext({
      requestHeaders: {},
    });
    const resolved = service.attachTrustedIdentity(provisional, {
      tenant: {
        tenantId: 'tenant_01',
        tenantKey: 'acme',
        tenantSchemaName: 'tenant_acme_1234abcd',
      },
      operator: {
        operatorId: 'operator_01',
        operatorType: 'tenant_admin',
      },
    });

    expect(resolved).toBe(provisional);
    expect(resolved).toMatchObject({
      requestScope: 'tenant',
      tenantId: 'tenant_01',
      tenantKey: 'acme',
      operatorId: 'operator_01',
      operatorType: 'tenant_admin',
      identitySource: 'trusted',
    });
  });

  it('rejects malformed requested scope values', () => {
    const service = new RequestContextService();

    expect(() =>
      service.createContext({
        requestedScope: 'platfrom',
      }),
    ).toThrow(/Invalid request scope: platfrom/);
  });

  it('stores raw headers without promoting them to trusted identity', () => {
    const service = new RequestContextService();
    const context = service.createContext({
      requestedScope: 'tenant',
      rawTenantId: 'tenant_01',
      rawTenantKey: 'Acme Corp',
      requestHeaders: {
        'x-tenant-schema': 'tenant_should_not_be_canonical',
      },
    });

    expect(context.provisional.requestHeaders['x-tenant-schema']).toBe(
      'tenant_should_not_be_canonical',
    );
    expect(context.requestScope).toBe('tenant');
    expect(context.tenantId).toBe('tenant_01');
    expect(context.tenantKey).toBe('Acme Corp');
    expect(context.identitySource).toBe('provisional');
  });
});
