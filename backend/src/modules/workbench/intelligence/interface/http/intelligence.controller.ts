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
import { IntelligenceCatalogService } from '../../application/intelligence-catalog.service';
import { IntelligenceRunsService } from '../../application/intelligence-runs.service';
import { IntelligenceItemsService } from '../../application/intelligence-items.service';
import { IntelligenceConversionsService } from '../../application/intelligence-conversions.service';
import { IntelligenceBriefsService } from '../../application/intelligence-briefs.service';
import {
  CreatePlanDto,
  CreateSourceDto,
  CreateTopicDto,
  ListPlansQueryDto,
  ListRunsQueryDto,
  ListSourcesQueryDto,
  ListTopicsQueryDto,
  RecordManualRunDto,
  UpdatePlanDto,
  UpdateSourceDto,
  UpdateTopicDto,
  ConvertItemToKnowledgePageDto,
  ConvertItemToMeetingAgendaDto,
  ConvertItemToRiskDto,
  ConvertItemToTaskDto,
  CreateItemDto,
  ListBriefsQueryDto,
  ListItemsQueryDto,
  SaveBriefDto,
  UpdateItemDto,
} from './dto/intelligence.dto';

@Controller('intelligence-topics')
export class IntelligenceTopicsController {
  constructor(private readonly catalog: IntelligenceCatalogService) {}

  @Get()
  list(@Query() query: ListTopicsQueryDto) {
    return this.catalog.listTopics(query);
  }

  @Post()
  create(@Body() dto: CreateTopicDto) {
    return this.catalog.createTopic(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalog.getTopic(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.catalog.updateTopic(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(@Param('id') id: string) {
    return this.catalog.archiveTopic(id);
  }
}

@Controller('intelligence-sources')
export class IntelligenceSourcesController {
  constructor(private readonly catalog: IntelligenceCatalogService) {}

  @Get()
  list(@Query() query: ListSourcesQueryDto) {
    return this.catalog.listSources(query);
  }

  @Post()
  create(@Body() dto: CreateSourceDto) {
    return this.catalog.createSource(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalog.getSource(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    return this.catalog.updateSource(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(@Param('id') id: string) {
    return this.catalog.archiveSource(id);
  }
}

@Controller('intelligence-plans')
export class IntelligencePlansController {
  constructor(
    private readonly catalog: IntelligenceCatalogService,
    private readonly runs: IntelligenceRunsService,
  ) {}

  @Get()
  list(@Query() query: ListPlansQueryDto) {
    return this.catalog.listPlans(query);
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.catalog.createPlan(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalog.getPlan(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.catalog.updatePlan(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(@Param('id') id: string) {
    return this.catalog.archivePlan(id);
  }

  @Post(':id/runs')
  recordRun(@Param('id') id: string, @Body() dto: RecordManualRunDto) {
    return this.runs.recordManualRun(id, dto);
  }
}

@Controller('intelligence-runs')
export class IntelligenceRunsController {
  constructor(private readonly runs: IntelligenceRunsService) {}

  @Get()
  list(@Query() query: ListRunsQueryDto) {
    return this.runs.list(query);
  }
}

@Controller('intelligence-items')
export class IntelligenceItemsController {
  constructor(private readonly items: IntelligenceItemsService, private readonly conversions: IntelligenceConversionsService) {}
  @Get() list(@Query() query: ListItemsQueryDto) { return this.items.list(query); }
  @Post() create(@Body() dto: CreateItemDto) { return this.items.create(dto); }
  @Get(':id') get(@Param('id') id: string) { return this.items.get(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateItemDto) { return this.items.update(id, dto); }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) archive(@Param('id') id: string) { return this.items.archive(id); }
  @Post(':id/task') task(@Param('id') id: string, @Body() dto: ConvertItemToTaskDto) { return this.conversions.toTask(id, dto); }
  @Post(':id/risk') risk(@Param('id') id: string, @Body() dto: ConvertItemToRiskDto) { return this.conversions.toRisk(id, dto); }
  @Post(':id/meeting-agenda') meeting(@Param('id') id: string, @Body() dto: ConvertItemToMeetingAgendaDto) { return this.conversions.toMeetingAgenda(id, dto); }
  @Post(':id/knowledge-page') knowledge(@Param('id') id: string, @Body() dto: ConvertItemToKnowledgePageDto) { return this.conversions.toKnowledgePage(id, dto); }
}

@Controller('intelligence-briefs')
export class IntelligenceBriefsController {
  constructor(private readonly briefs: IntelligenceBriefsService) {}
  @Get() list(@Query() query: ListBriefsQueryDto) { return this.briefs.list(query); }
  @Post() save(@Body() dto: SaveBriefDto) { return this.briefs.save(dto); }
  @Get(':id') get(@Param('id') id: string) { return this.briefs.get(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: SaveBriefDto) { return this.briefs.update(id, dto); }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) archive(@Param('id') id: string) { return this.briefs.archive(id); }
}
