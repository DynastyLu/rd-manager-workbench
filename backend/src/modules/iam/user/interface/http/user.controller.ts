import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RequestContextDecorator } from '../../../../../shared/decorators/request-context.decorator';
import type { RequestContext } from '../../../../../shared/kernel/request-context';
import { ResolveTrustedContextGuard } from '../../../policy/infrastructure/resolve-trusted-context.guard';
import type { TrustedTenantExecutionContext } from '../../../policy/application/require-trusted-tenant-context';
import { CreateUserUseCase } from '../../application/create-user.use-case';
import { ListUsersUseCase } from '../../application/list-users.use-case';
import { CreateUserDto } from './create-user.dto';

@Controller('iam/users')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
  ) {}

  @UseGuards(ResolveTrustedContextGuard)
  @Post()
  create(@Body() dto: CreateUserDto, @RequestContextDecorator() context: RequestContext) {
    return this.createUserUseCase.execute(dto, context);
  }

  @UseGuards(ResolveTrustedContextGuard)
  @Get()
  list(@RequestContextDecorator() context: RequestContext) {
    return this.listUsersUseCase.execute(context as TrustedTenantExecutionContext);
  }
}
