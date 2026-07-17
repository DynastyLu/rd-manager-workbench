import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { CreateTenantUseCase } from './application/create-tenant.use-case';
import { ListTenantsUseCase } from './application/list-tenants.use-case';
import { TENANT_REPOSITORY, TenantRepository } from './domain/tenant.repository';
import { TenantController } from './interface/http/tenant.controller';
import { InMemoryTenantRepository } from './infrastructure/in-memory-tenant.repository';
import { PrismaTenantRepository } from './infrastructure/prisma-tenant.repository';

@Module({
  imports: [PrismaModule],
  controllers: [TenantController],
  providers: [
    InMemoryTenantRepository,
    PrismaTenantRepository,
    {
      provide: TENANT_REPOSITORY,
      useFactory: (
        inMemoryRepository: InMemoryTenantRepository,
        prismaRepository: PrismaTenantRepository,
      ) => (shouldUseInMemoryPersistence() ? inMemoryRepository : prismaRepository),
      inject: [InMemoryTenantRepository, PrismaTenantRepository],
    },
    {
      provide: CreateTenantUseCase,
      useFactory: (repo: TenantRepository) => new CreateTenantUseCase(repo),
      inject: [TENANT_REPOSITORY],
    },
    {
      provide: ListTenantsUseCase,
      useFactory: (repo: TenantRepository) => new ListTenantsUseCase(repo),
      inject: [TENANT_REPOSITORY],
    },
  ],
  exports: [CreateTenantUseCase, ListTenantsUseCase, TENANT_REPOSITORY],
})
export class TenantModule {}

function shouldUseInMemoryPersistence() {
  return !process.env.DATABASE_URL?.trim();
}
