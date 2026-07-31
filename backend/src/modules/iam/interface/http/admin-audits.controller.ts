import { Controller, Get, Query } from '@nestjs/common';
import { SecurityAuditService } from '../../application/security-audit.service';
import { ListSecurityAuditsQueryDto } from './dto/users.dto';
import { PERMISSIONS, RequirePermissions } from './permissions.decorator';

@Controller('admin/security-audits')
@RequirePermissions(PERMISSIONS.AUDIT_READ)
export class AdminAuditsController {
  constructor(private readonly securityAudits: SecurityAuditService) {}

  @Get()
  list(@Query() input: ListSecurityAuditsQueryDto) {
    return this.securityAudits.list(input);
  }
}
