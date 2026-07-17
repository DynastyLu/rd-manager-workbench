import { Module } from '@nestjs/common';
import { RequestContextModule } from '../../../infrastructure/context/request-context.module';
import { TenantModule } from '../../platform/tenant/tenant.module';
import { ResolveTrustedContextGuard } from './infrastructure/resolve-trusted-context.guard';
import { TrustedTenantContextResolver } from './infrastructure/trusted-tenant-context.resolver';

@Module({
  imports: [RequestContextModule, TenantModule],
  providers: [TrustedTenantContextResolver, ResolveTrustedContextGuard],
  exports: [TrustedTenantContextResolver, ResolveTrustedContextGuard],
})
export class PolicyModule {}
