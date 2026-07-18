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
import { ApplicationsService } from '../../application/applications.service';
import {
  CreateWorkflowTemplateDto,
  ListWorkflowTemplatesQueryDto,
  UpdateWorkflowTemplateDto,
} from './dto/workflow-template.dto';

@Controller('workflow-templates')
export class WorkflowTemplatesController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(@Body() dto: CreateWorkflowTemplateDto) {
    return this.applicationsService.createTemplate(dto);
  }

  @Get()
  list(@Query() query: ListWorkflowTemplatesQueryDto) {
    return this.applicationsService.listTemplates(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.applicationsService.getTemplate(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowTemplateDto) {
    return this.applicationsService.updateTemplate(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string): Promise<void> {
    await this.applicationsService.archiveTemplate(id);
  }
}
