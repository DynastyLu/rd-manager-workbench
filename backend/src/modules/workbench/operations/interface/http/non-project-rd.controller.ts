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
import { RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
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
  @RequirePermissions('nonProjectRd.read')
  list(@Query() query: ListNonProjectRdQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions('nonProjectRd.manage')
  create(@Body() dto: CreateNonProjectRdDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermissions('nonProjectRd.read')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions('nonProjectRd.manage')
  update(@Param('id') id: string, @Body() dto: UpdateNonProjectRdDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('nonProjectRd.manage')
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }

  @Get(':id/outcomes')
  @RequirePermissions('nonProjectRd.read')
  listOutcomes(@Param('id') id: string) {
    return this.service.listOutcomes(id);
  }

  @Post(':id/outcomes')
  @RequirePermissions('nonProjectRd.manage')
  createOutcome(@Param('id') id: string, @Body() dto: CreateNonProjectRdOutcomeDto) {
    return this.service.createOutcome(id, dto);
  }

  @Patch(':id/outcomes/:outcomeId')
  @RequirePermissions('nonProjectRd.manage')
  updateOutcome(
    @Param('id') id: string,
    @Param('outcomeId') outcomeId: string,
    @Body() dto: UpdateNonProjectRdOutcomeDto,
  ) {
    return this.service.updateOutcome(id, outcomeId, dto);
  }

  @Delete(':id/outcomes/:outcomeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('nonProjectRd.manage')
  async deleteOutcome(@Param('id') id: string, @Param('outcomeId') outcomeId: string) {
    await this.service.deleteOutcome(id, outcomeId);
  }

  @Post(':id/project-suggestion')
  @RequirePermissions('nonProjectRd.read')
  projectSuggestion(@Param('id') id: string) {
    return this.service.projectSuggestion(id);
  }

  @Post(':id/task')
  @RequirePermissions('nonProjectRd.manage')
  createTask(@Param('id') id: string, @Body() dto: CreateNonProjectTaskDto) {
    return this.service.createTask(id, dto);
  }
}
