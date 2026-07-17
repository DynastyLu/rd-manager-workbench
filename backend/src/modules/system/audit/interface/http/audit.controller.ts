import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RequestContextDecorator } from '../../../../../shared/decorators/request-context.decorator';
import type { RequestContext } from '../../../../../shared/kernel/request-context';
import { ResolveTrustedContextGuard } from '../../../../iam/policy/infrastructure/resolve-trusted-context.guard';
import { CreateAuditLogDto } from './create-audit-log.dto';
import { ListAuditLogsUseCase } from '../../application/list-audit-logs.use-case';
import { RecordAuditLogUseCase } from '../../application/record-audit-log.use-case';

@Controller('system/audit')
export class AuditController {
  constructor(
    private readonly recordAuditLogUseCase: RecordAuditLogUseCase,
    private readonly listAuditLogsUseCase: ListAuditLogsUseCase,
  ) {}

  @UseGuards(ResolveTrustedContextGuard)
  @Post('logs')
  create(@Body() dto: CreateAuditLogDto, @RequestContextDecorator() context: RequestContext) {
    return this.recordAuditLogUseCase.execute(dto, context);
  }

  @UseGuards(ResolveTrustedContextGuard)
  @Get('logs')
  list(@RequestContextDecorator() context: RequestContext) {
    return this.listAuditLogsUseCase.execute(context);
  }
}
