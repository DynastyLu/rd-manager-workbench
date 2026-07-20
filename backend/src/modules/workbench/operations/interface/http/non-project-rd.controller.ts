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
import { NonProjectRdService } from '../../application/non-project-rd.service';
import {
  CreateNonProjectRdDto,
  CreateNonProjectRdOutcomeDto,
  CreateNonProjectTaskDto,
  ListNonProjectRdQueryDto,
  UpdateNonProjectRdDto,
  UpdateNonProjectRdOutcomeDto,
} from './dto/non-project-rd.dto';

@Controller('non-project-rd')
export class NonProjectRdController {
  constructor(private readonly service: NonProjectRdService) {}

  @Get()
  list(@Query() query: ListNonProjectRdQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateNonProjectRdDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNonProjectRdDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }

  @Get(':id/outcomes')
  listOutcomes(@Param('id') id: string) {
    return this.service.listOutcomes(id);
  }

  @Post(':id/outcomes')
  createOutcome(@Param('id') id: string, @Body() dto: CreateNonProjectRdOutcomeDto) {
    return this.service.createOutcome(id, dto);
  }

  @Patch(':id/outcomes/:outcomeId')
  updateOutcome(
    @Param('id') id: string,
    @Param('outcomeId') outcomeId: string,
    @Body() dto: UpdateNonProjectRdOutcomeDto,
  ) {
    return this.service.updateOutcome(id, outcomeId, dto);
  }

  @Delete(':id/outcomes/:outcomeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOutcome(@Param('id') id: string, @Param('outcomeId') outcomeId: string) {
    await this.service.deleteOutcome(id, outcomeId);
  }

  @Post(':id/project-suggestion')
  projectSuggestion(@Param('id') id: string) {
    return this.service.projectSuggestion(id);
  }

  @Post(':id/task')
  createTask(@Param('id') id: string, @Body() dto: CreateNonProjectTaskDto) {
    return this.service.createTask(id, dto);
  }
}
