import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlatformPrismaService } from './platform-prisma.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PlatformPrismaService],
  exports: [PlatformPrismaService],
})
export class PrismaModule {}
