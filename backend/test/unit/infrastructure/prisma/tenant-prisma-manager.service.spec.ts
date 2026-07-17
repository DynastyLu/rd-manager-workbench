import { ConfigService } from '@nestjs/config';
import { TenantPrismaManagerService } from '../../../../src/infrastructure/prisma/tenant-prisma-manager.service';

describe('TenantPrismaManagerService', () => {
  const configService = {
    get: jest.fn().mockReturnValue(
      'postgresql://postgres:postgres@localhost:5432/backend_core_platform?schema=platform',
    ),
  } as unknown as ConfigService;

  it('derives distinct schema names for normalized variant keys', () => {
    const service = new TenantPrismaManagerService(configService);
    const schemaA = service.resolveTenantSchemaName('Acme-Corp');
    const schemaB = service.resolveTenantSchemaName('acme_corp');

    expect(schemaA).not.toBe(schemaB);
    expect(schemaA).toMatch(/^tenant_[a-z0-9_]+_[a-f0-9]{8}$/);
    expect(schemaB).toMatch(/^tenant_[a-z0-9_]+_[a-f0-9]{8}$/);
  });

  it('builds a tenant database url with the resolved schema', () => {
    const service = new TenantPrismaManagerService(configService);

    expect(service.buildTenantDatabaseUrl('tenant_acme_corp')).toContain(
      'schema=tenant_acme_corp',
    );
  });

  it('resolves a stateless tenant database target from the tenant key', () => {
    const service = new TenantPrismaManagerService(configService);

    const target = service.resolveTenantDatabaseTarget({
      tenantKey: 'Acme Corp',
    });

    expect(target).toMatchObject({
      tenantKey: 'Acme Corp',
      schemaName: expect.stringMatching(/^tenant_[a-z0-9_]+_[a-f0-9]{8}$/),
    });
    expect(target.databaseUrl).toContain(`schema=${target.schemaName}`);
  });
});
