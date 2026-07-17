import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { PaperAuthService } from './paper-auth.service';
import { PaperAuthController } from './interface/http/paper-auth.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PaperAuthController],
  providers: [PaperAuthService],
})
export class PaperAuthModule {}
