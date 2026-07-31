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
import { TasksService } from '../../application/tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListMyWorkQueryDto } from './dto/list-my-work-query.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpsertTaskLaterDto } from './dto/upsert-task-later.dto';
import { UpsertTaskReminderDto } from './dto/upsert-task-reminder.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.TASK_CREATE)
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TASK_READ)
  list(@Query() query: ListTasksQueryDto) {
    return this.tasksService.listTasks(query);
  }

  @Get('my-work')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  listMyWork(@Query() query: ListMyWorkQueryDto) {
    return this.tasksService.listMyWork(query);
  }

  @Put(':id/later')
  @RequirePermissions(PERMISSIONS.TASK_UPDATE)
  upsertLater(@Param('id') id: string, @Body() dto: UpsertTaskLaterDto) {
    return this.tasksService.upsertLater(id, dto);
  }

  @Delete(':id/later')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TASK_UPDATE)
  async deleteLater(@Param('id') id: string): Promise<void> {
    await this.tasksService.deleteLater(id);
  }

  @Put(':id/reminder')
  @RequirePermissions(PERMISSIONS.TASK_UPDATE)
  upsertReminder(@Param('id') id: string, @Body() dto: UpsertTaskReminderDto) {
    return this.tasksService.upsertReminder(id, dto);
  }

  @Delete(':id/reminder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TASK_UPDATE)
  async deleteReminder(@Param('id') id: string): Promise<void> {
    await this.tasksService.deleteReminder(id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  get(@Param('id') id: string) {
    return this.tasksService.getTask(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TASK_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.updateTask(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TASK_DELETE)
  async archive(@Param('id') id: string): Promise<void> {
    await this.tasksService.archiveTask(id);
  }
}
