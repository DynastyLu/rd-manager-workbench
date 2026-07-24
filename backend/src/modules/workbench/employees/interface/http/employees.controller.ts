import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EmployeeProgressQueryService } from '../../application/employee-progress-query.service';
import { EmployeeWorkExportService } from '../../application/employee-work-export.service';
import { EmployeeWorkRiskService } from '../../application/employee-work-risk.service';
import { EmployeesService } from '../../application/employees.service';
import {
  CreateEmployeeDto,
  ExportEmployeeWorkItemsQueryDto,
  ListEmployeeWorkItemsQueryDto,
  ListEmployeesQueryDto,
  ProgressPeriodQueryDto,
  UpdateEmployeeDto,
} from './dto/employees.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  list(@Query() query: ListEmployeesQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }
}

@Controller()
export class EmployeeProgressController {
  constructor(
    private readonly progress: EmployeeProgressQueryService,
    private readonly workExport: EmployeeWorkExportService,
    private readonly workRisks: EmployeeWorkRiskService,
  ) {}

  @Get('employee-progress')
  team(@Query() query: ProgressPeriodQueryDto) {
    return this.progress.team(query);
  }

  @Get('employee-work-items')
  workItems(@Query() query: ListEmployeeWorkItemsQueryDto) {
    return this.progress.workItems(query);
  }

  @Get('employee-work-items/export')
  async exportWorkItems(
    @Query() query: ExportEmployeeWorkItemsQueryDto,
    @Res() response: Response,
  ) {
    const result = await this.workExport.export(query);
    const fallbackName = result.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    response.setHeader('Content-Type', result.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    );
    response.setHeader('Content-Length', result.content.length);
    response.setHeader('X-Source-Batch-Ids', result.sourceBatchIds.join(','));
    response.status(HttpStatus.OK).send(result.content);
  }

  @Get('employee-work-items/:id')
  workItem(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.progress.workItem(id);
  }

  @Post('employee-work-items/:id/convert-risk')
  convertRisk(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.workRisks.convert(id);
  }

  @Get('employees/:id/progress')
  employee(@Param('id') id: string, @Query() query: ProgressPeriodQueryDto) {
    return this.progress.employee(id, query);
  }

  @Get('projects/:id/team-progress')
  project(@Param('id') id: string, @Query() query: ProgressPeriodQueryDto) {
    return this.progress.project(id, query);
  }
}
