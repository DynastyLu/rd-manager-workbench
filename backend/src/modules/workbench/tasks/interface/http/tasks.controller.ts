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
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(dto);
  }

  @Get()
  list(@Query() query: ListTasksQueryDto) {
    return this.tasksService.listTasks(query);
  }

  @Get('my-work')
  listMyWork(@Query() query: ListMyWorkQueryDto) {
    return this.tasksService.listMyWork(query);
  }

  @Put(':id/later')
  upsertLater(@Param('id') id: string, @Body() dto: UpsertTaskLaterDto) {
    return this.tasksService.upsertLater(id, dto);
  }

  @Delete(':id/later')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLater(@Param('id') id: string): Promise<void> {
    await this.tasksService.deleteLater(id);
  }

  @Put(':id/reminder')
  upsertReminder(@Param('id') id: string, @Body() dto: UpsertTaskReminderDto) {
    return this.tasksService.upsertReminder(id, dto);
  }

  @Delete(':id/reminder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReminder(@Param('id') id: string): Promise<void> {
    await this.tasksService.deleteReminder(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tasksService.getTask(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.updateTask(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string): Promise<void> {
    await this.tasksService.archiveTask(id);
  }
}
