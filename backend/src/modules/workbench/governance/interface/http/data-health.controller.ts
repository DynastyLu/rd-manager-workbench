import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
import { DataHealthService } from '../../application/data-health.service';
import { DataHealthQueryDto } from './dto/governance.dto';

@Controller('governance/health')
export class DataHealthController {
  constructor(private readonly health: DataHealthService) {}

  @Get()
  @RequirePermissions('governance.read')
  check(@Query() query: DataHealthQueryDto) {
    return this.health.check({
      deep: query.deep ?? false,
      expectedMigrationHead: process.env.APP_MIGRATION_HEAD,
    });
  }
}
