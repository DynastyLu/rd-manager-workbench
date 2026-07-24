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
} from '@nestjs/common';
import { EmployeeProgressQueryService } from '../../application/employee-progress-query.service';
import { EmployeesService } from '../../application/employees.service';
import {
  CreateEmployeeDto,
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
  constructor(private readonly progress: EmployeeProgressQueryService) {}

  @Get('employee-progress')
  team(@Query() query: ProgressPeriodQueryDto) {
    return this.progress.team(query);
  }

  @Get('employee-work-items')
  workItems(@Query() query: ListEmployeeWorkItemsQueryDto) {
    return this.progress.workItems(query);
  }

  @Get('employee-work-items/:id')
  workItem(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.progress.workItem(id);
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
