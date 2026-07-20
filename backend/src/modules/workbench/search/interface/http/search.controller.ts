import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SearchActionsService } from '../../application/search-actions.service';
import { SearchService } from '../../application/search.service';
import {
  GlobalSearchQueryDto,
  RunSearchActionDto,
  SearchActionParamsDto,
} from './dto/search.dto';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly actionsService: SearchActionsService,
  ) {}

  @Get()
  search(@Query() query: GlobalSearchQueryDto) {
    return this.searchService.search(query);
  }

  @Post('actions/:type/:id')
  runAction(@Param() params: SearchActionParamsDto, @Body() body: RunSearchActionDto) {
    return this.actionsService.run(params.type, params.id, body);
  }
}
