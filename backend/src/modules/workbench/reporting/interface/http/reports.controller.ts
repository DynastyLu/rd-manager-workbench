import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from '../../application/reports.service';
import { ExportReportQueryDto, ReportQueryDto, ResourceReportQueryDto } from './dto/reports.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('portfolio') portfolio(@Query() query: ReportQueryDto) { return this.reports.portfolio(query); }
  @Get('task-completion-trend') taskCompletionTrend(@Query() query: ReportQueryDto) { return this.reports.taskCompletionTrend(query); }
  @Get('risk-trend') riskTrend(@Query() query: ReportQueryDto) { return this.reports.riskTrend(query); }
  @Get('resource-load') resourceLoad(@Query() query: ResourceReportQueryDto) { return this.reports.resourceLoad(query); }
  @Get('intelligence') intelligence(@Query() query: ReportQueryDto) { return this.reports.intelligence(query); }
  @Get('summary') summary(@Query() query: ReportQueryDto) { return this.reports.summary(query); }

  @Get('export')
  async export(@Query() query: ExportReportQueryDto, @Res() response: Response) {
    const result = await this.reports.exportReport(query);
    response.type(result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="workbench-${query.kind.toLowerCase()}-${query.from.slice(0, 10)}-${query.to.slice(0, 10)}.${result.extension}"`);
    response.send(result.content);
  }
}
