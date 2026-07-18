import { Module } from '@nestjs/common';
import { DashboardService } from './application/dashboard.service';
import { DashboardController } from './interface/http/dashboard.controller';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
