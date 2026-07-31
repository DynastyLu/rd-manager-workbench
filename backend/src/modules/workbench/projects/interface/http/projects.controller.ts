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
  Put,
  Query,
} from '@nestjs/common';
import {
  PERMISSIONS,
  RequirePermissions,
} from '../../../../iam/interface/http/permissions.decorator';
import { ProjectPlanService } from '../../application/project-plan.service';
import { ProjectsService } from '../../application/projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  CreateProjectPlanBaselineDto,
  ProjectScheduleChangeDto,
  ProjectWorkItemViewDto,
} from './dto/project-plan.dto';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectPlanService: ProjectPlanService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.PROJECT_CREATE)
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  list(@Query() query: ListProjectsQueryDto) {
    return this.projectsService.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  get(@Param('id') id: string) {
    return this.projectsService.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Put(':id/work-item-view')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  updateWorkItemView(@Param('id') id: string, @Body() dto: ProjectWorkItemViewDto) {
    return this.projectsService.updateWorkItemView(id, dto);
  }

  @Post(':id/plan-baselines')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  createPlanBaseline(@Param('id') id: string, @Body() dto: CreateProjectPlanBaselineDto) {
    return this.projectPlanService.createBaseline(id, dto);
  }

  @Get(':id/plan-baselines')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  listPlanBaselines(@Param('id') id: string) {
    return this.projectPlanService.listBaselines(id);
  }

  @Get(':id/plan-baselines/:baselineId')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  getPlanBaseline(@Param('id') id: string, @Param('baselineId') baselineId: string) {
    return this.projectPlanService.getBaseline(id, baselineId);
  }

  @Get(':id/plan-changes')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  listPlanChanges(@Param('id') id: string) {
    return this.projectPlanService.listChanges(id);
  }

  @Get(':id/critical-path')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  criticalPath(@Param('id') id: string) {
    return this.projectPlanService.calculateCriticalPath(id);
  }

  @Post(':id/schedule-impact')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  previewScheduleImpact(@Param('id') id: string, @Body() dto: ProjectScheduleChangeDto) {
    return this.projectPlanService.previewScheduleImpact(id, dto);
  }

  @Post(':id/schedule-changes')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  applyScheduleChange(@Param('id') id: string, @Body() dto: ProjectScheduleChangeDto) {
    return this.projectPlanService.applyScheduleChange(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROJECT_DELETE)
  async archive(@Param('id') id: string): Promise<void> {
    await this.projectsService.archive(id);
  }
}
