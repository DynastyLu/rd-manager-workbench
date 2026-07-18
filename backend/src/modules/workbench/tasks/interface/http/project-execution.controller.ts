import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { TasksService } from '../../application/tasks.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { CreateProgressReportDto } from './dto/create-progress-report.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';

@Controller('projects')
export class ProjectExecutionController {
  constructor(private readonly tasksService: TasksService) {}

  @Post(':projectId/milestones')
  createMilestone(@Param('projectId') projectId: string, @Body() dto: CreateMilestoneDto) {
    return this.tasksService.createMilestone(projectId, dto);
  }

  @Patch(':projectId/milestones/:milestoneId')
  updateMilestone(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.tasksService.updateMilestone(projectId, milestoneId, dto);
  }

  @Post(':projectId/progress-reports')
  createProgressReport(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProgressReportDto,
  ) {
    return this.tasksService.createProgressReport(projectId, dto);
  }
}
