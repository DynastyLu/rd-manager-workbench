import { AppError } from '../../../../../src/shared/errors/app-error';
import { TenantPrismaManagerService } from '../../../../../src/infrastructure/prisma/tenant-prisma-manager.service';
import { CreateTenantUseCase } from '../../../../../src/modules/platform/tenant/application/create-tenant.use-case';
import { InMemoryTenantRepository } from '../../../../../src/modules/platform/tenant/infrastructure/in-memory-tenant.repository';
import { TenantStatus } from '../../../../../src/modules/platform/tenant/domain/tenant-status.enum';

describe('CreateTenantUseCase', () => {
  const tenantRepository = {
    findByKey: jest.fn(async () => undefined),
    create: jest.fn(async (tenant) => tenant),
  };

  it('creates a tenant in pending state and leaves schema derivation to infrastructure', async () => {
    const useCase = new CreateTenantUseCase(tenantRepository as never);

    const result = await useCase.execute({
      name: 'Acme Corporation',
      key: 'Acme Corp',
    });

    expect(result).toMatchObject({
      name: 'Acme Corporation',
      key: 'Acme Corp',
      status: TenantStatus.PENDING,
    });
    expect(tenantRepository.findByKey).toHaveBeenCalledWith('Acme Corp');
    expect(tenantRepository.create).toHaveBeenCalledWith({
      name: 'Acme Corporation',
      key: 'Acme Corp',
      status: TenantStatus.PENDING,
    });
  });

  it('rejects duplicate tenant keys before creating a tenant', async () => {
    const useCase = new CreateTenantUseCase({
      findByKey: jest.fn(async () => ({ id: 'tenant-1' })),
      create: jest.fn(),
    } as never);

    await expect(
      useCase.execute({
        name: 'Acme Corporation',
        key: 'Acme Corp',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('persists schema derivation in the repository boundary', async () => {
    const repository = new InMemoryTenantRepository(new TenantPrismaManagerService({
      get: jest.fn(() => 'postgresql://postgres:postgres@localhost:5432/backend_core_platform?schema=platform'),
    } as never));

    const tenant = await repository.create({
      name: 'Acme Corporation',
      key: 'Acme Corp',
      status: TenantStatus.PENDING,
    });

    expect(tenant.schemaName).toMatch(/^tenant_[a-z0-9_]+_[a-f0-9]{8}$/);
  });
});
