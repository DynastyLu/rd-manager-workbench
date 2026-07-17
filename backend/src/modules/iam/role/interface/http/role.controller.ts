import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RequestContextDecorator } from '../../../../../shared/decorators/request-context.decorator';
import type { RequestContext } from '../../../../../shared/kernel/request-context';
import { ResolveTrustedContextGuard } from '../../../policy/infrastructure/resolve-trusted-context.guard';
import type { TrustedTenantExecutionContext } from '../../../policy/application/require-trusted-tenant-context';
import { CreateRoleUseCase } from '../../application/create-role.use-case';
import { ListRolesUseCase } from '../../application/list-roles.use-case';
import { CreateRoleDto } from './create-role.dto';

@Controller('iam/roles')
export class RoleController {
  constructor(
    private readonly createRoleUseCase: CreateRoleUseCase,
    private readonly listRolesUseCase: ListRolesUseCase,
  ) {}

  @UseGuards(ResolveTrustedContextGuard)
  @Post()
  create(@Body() dto: CreateRoleDto, @RequestContextDecorator() context: RequestContext) {
    return this.createRoleUseCase.execute(dto, context);
  }

  @UseGuards(ResolveTrustedContextGuard)
  @Get()
  list(@RequestContextDecorator() context: RequestContext) {
    return this.listRolesUseCase.execute(context as TrustedTenantExecutionContext);
  }
}
