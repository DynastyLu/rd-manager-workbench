import { RequestContextMiddleware } from '../../../src/infrastructure/context/request-context.middleware';
import { RequestContextService } from '../../../src/infrastructure/context/request-context.service';

describe('RequestContextMiddleware', () => {
  it('initializes a tenant-scoped provisional context from complete tenant transport metadata', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const next = jest.fn(() => {
      expect(service.getContext()).toMatchObject({
        requestScope: 'tenant',
        tenantId: 'tenant-01',
        tenantKey: 'acme',
        operatorType: 'tenant_admin',
        identitySource: 'provisional',
        provisional: {
          requestedScope: 'tenant',
          rawTenantId: 'tenant-01',
          rawTenantKey: 'acme',
          rawOperatorType: 'tenant_admin',
        },
      });
    });

    middleware.use(
      {
        ip: '127.0.0.1',
        headers: {
          'x-request-scope': 'tenant',
          'x-tenant-id': 'tenant-01',
          'x-tenant-key': 'acme',
          'x-tenant-schema': 'tenant_should_not_be_canonical',
          'x-operator-type': 'tenant_admin',
        },
      } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed tenant request scope headers', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const next = jest.fn();

    expect(() =>
      middleware.use(
        {
          ip: '127.0.0.1',
          headers: {
            'x-request-scope': 'platfrom',
          },
        } as never,
        {} as never,
        next,
      ),
    ).toThrow(/Invalid request scope: platfrom/);

    expect(next).not.toHaveBeenCalled();
  });

  it('keeps x-tenant-schema as transport metadata only', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const next = jest.fn();
    const req: any = {
      ip: '127.0.0.1',
      headers: {
        'x-request-scope': 'tenant',
        'x-tenant-id': 'tenant-01',
        'x-tenant-key': 'acme',
        'x-tenant-schema': 'tenant_should_not_be_canonical',
      },
    };

    middleware.use(req as never, {} as never, next);

    expect(req.requestContext).toMatchObject({
      requestScope: 'tenant',
      tenantId: 'tenant-01',
      tenantKey: 'acme',
      identitySource: 'provisional',
      provisional: {
        requestedScope: 'tenant',
        rawTenantId: 'tenant-01',
        rawTenantKey: 'acme',
      },
    });
    expect(req.requestContext.provisional.requestHeaders['x-tenant-schema']).toBe(
      'tenant_should_not_be_canonical',
    );
  });

  it('updates the same live context reference after trusted identity resolution', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const req: any = {
      ip: '127.0.0.1',
      headers: {
        'x-request-scope': 'tenant',
        'x-tenant-id': 'tenant-01',
        'x-tenant-key': 'acme',
        'x-operator-id': 'operator-01',
        'x-operator-type': 'tenant_admin',
      },
    };

    middleware.use(req as never, {} as never, () => {
      const context = service.requireContext();
      const sameReference = service.attachTrustedIdentity(context, {
        tenant: {
          tenantId: 'tenant-01',
          tenantKey: 'acme',
        },
        operator: {
          operatorId: 'operator-01',
          operatorType: 'tenant_admin',
        },
      });

      expect(sameReference).toBe(req.requestContext);
      expect(service.getContext()).toBe(req.requestContext);
      expect(req.requestContext).toMatchObject({
        requestScope: 'tenant',
        tenantId: 'tenant-01',
        tenantKey: 'acme',
        operatorId: 'operator-01',
        operatorType: 'tenant_admin',
        identitySource: 'trusted',
      });
    });
  });

});
