import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EmployeeProgressQueryService } from '../../application/employee-progress-query.service';
import { EmployeeWeekPlansService } from '../../application/employee-week-plans.service';
import { EmployeeWorkItemsService } from '../../application/employee-work-items.service';
import { EmployeeWorkExportService } from '../../application/employee-work-export.service';
import { EmployeeWorkRiskService } from '../../application/employee-work-risk.service';
import { EmployeesService } from '../../application/employees.service';
import {
  CancelEmployeeWeekPlanDto,
  CreateEmployeeDto,
  ExportEmployeeWorkItemsQueryDto,
  ListEmployeeWeekPlansQueryDto,
  ListEmployeeWorkItemsQueryDto,
  ListEmployeesQueryDto,
  MatchEmployeeWeekPlanDto,
  ProgressPeriodQueryDto,
  UpdateEmployeeWeekPlanDto,
  UpdateEmployeeWorkItemDto,
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
    private readonly weekPlanActions: EmployeeWeekPlansService,
    private readonly workItemActions: EmployeeWorkItemsService,
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
  workItem(@Param('id') id: string) {
    return this.progress.workItem(id);
  }

  @Patch('employee-work-items/:id')
  updateWorkItem(@Param('id') id: string, @Body() dto: UpdateEmployeeWorkItemDto) {
    const { plannedCompletionAt, ...systemFields } = dto;
    return this.workItemActions.updateSystemFields(id, {
      ...systemFields,
      ...(plannedCompletionAt !== undefined
        ? {
            plannedCompletionAt: plannedCompletionAt
              ? new Date(`${plannedCompletionAt}T00:00:00.000Z`)
              : null,
          }
        : {}),
    });
  }

  @Get('employee-week-plans')
  weekPlans(@Query() query: ListEmployeeWeekPlansQueryDto) {
    return this.progress.weekPlans(query);
  }

  @Get('employee-week-plans/:id')
  weekPlan(@Param('id') id: string) {
    return this.progress.weekPlan(id);
  }

  @Patch('employee-week-plans/:id')
  updateWeekPlan(@Param('id') id: string, @Body() dto: UpdateEmployeeWeekPlanDto) {
    const { plannedCompletionAt, ...systemFields } = dto;
    return this.weekPlanActions.updateSystemFields(id, {
      ...systemFields,
      ...(plannedCompletionAt !== undefined
        ? {
            plannedCompletionAt: plannedCompletionAt
              ? new Date(`${plannedCompletionAt}T00:00:00.000Z`)
              : null,
          }
        : {}),
    });
  }

  @Post('employee-week-plans/:id/cancel')
  cancelWeekPlan(@Param('id') id: string, @Body() dto: CancelEmployeeWeekPlanDto) {
    return this.weekPlanActions.cancel(id, dto.reason);
  }

  @Post('employee-week-plans/:id/match')
  matchWeekPlan(@Param('id') id: string, @Body() dto: MatchEmployeeWeekPlanDto) {
    return this.weekPlanActions.match(id, dto.workItemId);
  }

  @Post('employee-week-plans/:id/unmatch')
  unmatchWeekPlan(@Param('id') id: string) {
    return this.weekPlanActions.unmatch(id);
  }

  @Post('employee-week-plans/:id/convert-to-task')
  convertWeekPlanToTask(@Param('id') id: string) {
    return this.weekPlanActions.convertToTask(id);
  }

  @Post('employee-work-items/:id/convert-risk')
  convertRisk(@Param('id') id: string) {
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
