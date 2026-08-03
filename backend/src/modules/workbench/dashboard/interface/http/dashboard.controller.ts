import { Controller, Get } from '@nestjs/common';
import {
  PERMISSIONS,
  RequirePermissions,
} from '../../../../iam/interface/http/permissions.decorator';
import { DashboardService } from '../../application/dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ, PERMISSIONS.TASK_READ)
  getDashboard() {
    return this.dashboardService.getDashboard();
  }
}
