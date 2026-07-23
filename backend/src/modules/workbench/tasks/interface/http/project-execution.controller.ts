import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { TasksService } from '../../application/tasks.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { CreateProgressReportDto } from './dto/create-progress-report.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { UpdateProgressReportDto } from './dto/update-progress-report.dto';

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

  @Delete(':projectId/milestones/:milestoneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMilestone(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
  ): Promise<void> {
    await this.tasksService.deleteMilestone(projectId, milestoneId);
  }

  @Post(':projectId/progress-reports')
  createProgressReport(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProgressReportDto,
  ) {
    return this.tasksService.createProgressReport(projectId, dto);
  }

  @Patch(':projectId/progress-reports/:reportId')
  updateProgressReport(
    @Param('projectId') projectId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateProgressReportDto,
  ) {
    return this.tasksService.updateProgressReport(projectId, reportId, dto);
  }

  @Delete(':projectId/progress-reports/:reportId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProgressReport(
    @Param('projectId') projectId: string,
    @Param('reportId') reportId: string,
  ): Promise<void> {
    await this.tasksService.deleteProgressReport(projectId, reportId);
  }
}
