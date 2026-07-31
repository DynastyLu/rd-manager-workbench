import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS, RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
import { IssuesService } from '../../application/issues.service';
import { CreateIssueDto, ListIssuesQueryDto, UpdateIssueDto } from './dto/management.dto';

@Controller('issues')
@RequirePermissions(PERMISSIONS.ISSUE_READ)
export class IssuesController {
  constructor(private readonly service: IssuesService) {}

  @Get()
  list(@Query() query: ListIssuesQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ISSUE_CREATE)
  create(@Body() dto: CreateIssueDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ISSUE_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateIssueDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ISSUE_DELETE)
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }
}
