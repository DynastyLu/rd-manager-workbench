import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { CreateRoleUseCase } from './application/create-role.use-case';
import { ListRolesUseCase } from './application/list-roles.use-case';
import { ROLE_REPOSITORY } from './domain/role.repository';
import { RoleController } from './interface/http/role.controller';
import { InMemoryRoleRepository } from './infrastructure/in-memory-role.repository';

@Module({
  imports: [PolicyModule],
  controllers: [RoleController],
  providers: [
    InMemoryRoleRepository,
    {
      provide: ROLE_REPOSITORY,
      useExisting: InMemoryRoleRepository,
    },
    {
      provide: CreateRoleUseCase,
      useFactory: (roleRepository: InMemoryRoleRepository) => new CreateRoleUseCase(roleRepository),
      inject: [InMemoryRoleRepository],
    },
    {
      provide: ListRolesUseCase,
      useFactory: (roleRepository: InMemoryRoleRepository) => new ListRolesUseCase(roleRepository),
      inject: [InMemoryRoleRepository],
    },
  ],
  exports: [CreateRoleUseCase, ListRolesUseCase],
})
export class RoleModule {}
