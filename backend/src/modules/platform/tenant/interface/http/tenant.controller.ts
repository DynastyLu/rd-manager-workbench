import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateTenantUseCase } from '../../application/create-tenant.use-case';
import { ListTenantsUseCase } from '../../application/list-tenants.use-case';
import { CreateTenantDto } from './create-tenant.dto';

@Controller('platform/tenants')
export class TenantController {
  constructor(
    private readonly createTenantUseCase: CreateTenantUseCase,
    private readonly listTenantsUseCase: ListTenantsUseCase,
  ) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.createTenantUseCase.execute(dto);
  }

  @Get()
  list() {
    return this.listTenantsUseCase.execute();
  }
}
