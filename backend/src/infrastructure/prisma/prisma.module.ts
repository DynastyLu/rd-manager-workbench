import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlatformPrismaService } from './platform-prisma.service';
import { TenantPrismaManagerService } from './tenant-prisma-manager.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PlatformPrismaService, TenantPrismaManagerService],
  exports: [PlatformPrismaService, TenantPrismaManagerService],
})
export class PrismaModule {}
