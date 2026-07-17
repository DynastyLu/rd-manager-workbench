import { ExecutionContext } from '@nestjs/common';
import { RequestContextService } from '../../../../../src/infrastructure/context/request-context.service';
import { ResolveTrustedContextGuard } from '../../../../../src/modules/iam/policy/infrastructure/resolve-trusted-context.guard';
import { TrustedTenantContextResolver } from '../../../../../src/modules/iam/policy/infrastructure/trusted-tenant-context.resolver';

describe('ResolveTrustedContextGuard', () => {
  it('allows platform-scoped requests without promoting tenant identity', async () => {
    const requestContextService = new RequestContextService();
    const trustedTenantContextResolver = {
      attach: jest.fn(),
    } as unknown as TrustedTenantContextResolver;
    const guard = new ResolveTrustedContextGuard(
      requestContextService,
      trustedTenantContextResolver,
    );
    const requestContext = requestContextService.createContext({ requestHeaders: {} });
    await requestContextService.run(requestContext, async () => {
      const executionContext = createExecutionContext({ requestContext });
      await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    });
  });

  it('rejects tenant requests that cannot be trusted', async () => {
    const requestContextService = new RequestContextService();
    const trustedTenantContextResolver = {
      attach: jest.fn(async (context) => context),
    } as unknown as TrustedTenantContextResolver;
    const guard = new ResolveTrustedContextGuard(
      requestContextService,
      trustedTenantContextResolver,
    );
    const requestContext = requestContextService.createContext({
      requestedScope: 'tenant',
      rawTenantId: 'tenant_001',
      rawTenantKey: 'acme',
      requestHeaders: {},
    });

    await requestContextService.run(requestContext, async () => {
      await expect(
        guard.canActivate(createExecutionContext({ requestContext })),
      ).rejects.toMatchObject({
        code: 'TENANT_CONTEXT_REQUIRED',
      });
    });
  });
});

function createExecutionContext(request: { requestContext?: unknown }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
