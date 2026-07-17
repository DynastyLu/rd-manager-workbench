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
} from '@nestjs/common';
import { TasksService } from '../../application/tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

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
