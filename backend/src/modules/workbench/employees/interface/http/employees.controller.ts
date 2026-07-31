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
import {
  PERMISSIONS,
  RequirePermissions,
} from '../../../../iam/interface/http/permissions.decorator';
import { EmployeeProgressQueryService } from '../../application/employee-progress-query.service';
import { EmployeeWeekPlansService } from '../../application/employee-week-plans.service';
import { EmployeeWorkItemsService } from '../../application/employee-work-items.service';
import { EmployeeWorkExportService } from '../../application/employee-work-export.service';
import { EmployeeWorkRiskService } from '../../application/employee-work-risk.service';
import { EmployeesService } from '../../application/employees.service';
import { ProjectProgressDraftService } from '../../application/project-progress-draft.service';
import {
  AdoptProjectProgressDraftDto,
  CancelEmployeeWeekPlanDto,
  CreateEmployeeDto,
  ExportEmployeeWorkItemsQueryDto,
  ListEmployeeWeekPlansQueryDto,
  ListEmployeeWorkItemsQueryDto,
  ListEmployeesQueryDto,
  ListProjectProgressDraftsQueryDto,
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
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  list(@Query() query: ListEmployeesQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.EMPLOYEE_ARCHIVE)
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_ARCHIVE)
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.EMPLOYEE_DELETE)
  async permanentDelete(@Param('id') id: string) {
    await this.service.permanentDelete(id);
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
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  team(@Query() query: ProgressPeriodQueryDto) {
    return this.progress.team(query);
  }

  @Get('employee-work-items')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  workItems(@Query() query: ListEmployeeWorkItemsQueryDto) {
    return this.progress.workItems(query);
  }

  @Get('employee-work-items/export')
  @RequirePermissions(PERMISSIONS.REPORT_EXPORT)
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
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  workItem(@Param('id') id: string) {
    return this.progress.workItem(id);
  }

  @Patch('employee-work-items/:id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  async updateWorkItem(@Param('id') id: string, @Body() dto: UpdateEmployeeWorkItemDto) {
    await this.progress.workItem(id);
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
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  weekPlans(@Query() query: ListEmployeeWeekPlansQueryDto) {
    return this.progress.weekPlans(query);
  }

  @Get('employee-week-plans/:id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  weekPlan(@Param('id') id: string) {
    return this.progress.weekPlan(id);
  }

  @Patch('employee-week-plans/:id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
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
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  cancelWeekPlan(@Param('id') id: string, @Body() dto: CancelEmployeeWeekPlanDto) {
    return this.weekPlanActions.cancel(id, dto.reason);
  }

  @Post('employee-week-plans/:id/match')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  matchWeekPlan(@Param('id') id: string, @Body() dto: MatchEmployeeWeekPlanDto) {
    return this.weekPlanActions.match(id, dto.workItemId);
  }

  @Post('employee-week-plans/:id/unmatch')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  unmatchWeekPlan(@Param('id') id: string) {
    return this.weekPlanActions.unmatch(id);
  }

  @Post('employee-week-plans/:id/convert-to-task')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  convertWeekPlanToTask(@Param('id') id: string) {
    return this.weekPlanActions.convertToTask(id);
  }

  @Post('employee-work-items/:id/convert-risk')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  async convertRisk(@Param('id') id: string) {
    await this.progress.workItem(id);
    return this.workRisks.convert(id);
  }

  @Get('employees/:id/progress')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  employee(@Param('id') id: string, @Query() query: ProgressPeriodQueryDto) {
    return this.progress.employee(id, query);
  }

  @Get('projects/:id/team-progress')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  project(@Param('id') id: string, @Query() query: ProgressPeriodQueryDto) {
    return this.progress.project(id, query);
  }
}

@Controller()
export class ProjectProgressDraftsController {
  constructor(private readonly drafts: ProjectProgressDraftService) {}

  @Get('project-progress-drafts')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  list(@Query() query: ListProjectProgressDraftsQueryDto) {
    return this.drafts.list(query);
  }

  @Post('employee-work-imports/:id/project-progress-drafts/preview')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  preview(@Param('id') id: string) {
    return this.drafts.generateForBatch(id);
  }

  @Post('project-progress-drafts/:id/adopt')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  adopt(@Param('id') id: string, @Body() dto: AdoptProjectProgressDraftDto) {
    return this.drafts.adopt(id, dto);
  }

  @Post('project-progress-drafts/:id/ignore')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  ignore(@Param('id') id: string) {
    return this.drafts.ignore(id);
  }
}
