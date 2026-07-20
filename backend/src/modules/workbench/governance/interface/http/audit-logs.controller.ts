import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from '../../application/audit-log.service';
import { ListAuditLogsQueryDto } from './dto/governance.dto';

@Controller('governance/audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.audit.list({
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
