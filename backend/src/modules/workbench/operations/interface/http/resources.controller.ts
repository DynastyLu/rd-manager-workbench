import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ResourcesService } from '../../application/resources.service';
import { CreateResourceDto, CreateResourceLoadDto, CreateResourceSkillDto, ListResourcesQueryDto, LoadSummaryQueryDto, UpdateResourceDto, UpdateResourceLoadDto, UpdateResourceSkillDto } from './dto/resources.dto';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}
  @Get() list(@Query() query: ListResourcesQueryDto) { return this.service.list(query); }
  @Post() create(@Body() dto: CreateResourceDto) { return this.service.create(dto); }
  @Get('load-summary') loadSummary(@Query() query: LoadSummaryQueryDto) { return this.service.loadSummary(query); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateResourceDto) { return this.service.update(id, dto); }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async archive(@Param('id') id: string) { await this.service.archive(id); }
  @Post(':id/skills') createSkill(@Param('id') id: string, @Body() dto: CreateResourceSkillDto) { return this.service.createSkill(id, dto); }
  @Patch(':id/skills/:skillId') updateSkill(@Param('id') id: string, @Param('skillId') skillId: string, @Body() dto: UpdateResourceSkillDto) { return this.service.updateSkill(id, skillId, dto); }
  @Delete(':id/skills/:skillId') @HttpCode(HttpStatus.NO_CONTENT) async deleteSkill(@Param('id') id: string, @Param('skillId') skillId: string) { await this.service.deleteSkill(id, skillId); }
  @Post(':id/load-entries') createLoad(@Param('id') id: string, @Body() dto: CreateResourceLoadDto) { return this.service.createLoadEntry(id, dto); }
  @Patch(':id/load-entries/:entryId') updateLoad(@Param('id') id: string, @Param('entryId') entryId: string, @Body() dto: UpdateResourceLoadDto) { return this.service.updateLoadEntry(id, entryId, dto); }
  @Delete(':id/load-entries/:entryId') @HttpCode(HttpStatus.NO_CONTENT) async archiveLoad(@Param('id') id: string, @Param('entryId') entryId: string) { await this.service.archiveLoadEntry(id, entryId); }
}
