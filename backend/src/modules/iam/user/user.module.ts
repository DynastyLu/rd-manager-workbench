import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { CreateUserUseCase } from './application/create-user.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { USER_REPOSITORY } from './domain/user.repository';
import { UserController } from './interface/http/user.controller';
import { InMemoryUserRepository } from './infrastructure/in-memory-user.repository';

@Module({
  imports: [PolicyModule],
  controllers: [UserController],
  providers: [
    InMemoryUserRepository,
    {
      provide: USER_REPOSITORY,
      useExisting: InMemoryUserRepository,
    },
    {
      provide: CreateUserUseCase,
      useFactory: (userRepository: InMemoryUserRepository) => new CreateUserUseCase(userRepository),
      inject: [InMemoryUserRepository],
    },
    {
      provide: ListUsersUseCase,
      useFactory: (userRepository: InMemoryUserRepository) => new ListUsersUseCase(userRepository),
      inject: [InMemoryUserRepository],
    },
  ],
  exports: [CreateUserUseCase, ListUsersUseCase],
})
export class UserModule {}
