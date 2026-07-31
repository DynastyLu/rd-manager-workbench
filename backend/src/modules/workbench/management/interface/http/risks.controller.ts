import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS, RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
import { RisksService } from '../../application/risks.service';
import { CreateRiskDto, ListRisksQueryDto, UpdateRiskDto } from './dto/management.dto';

@Controller('risks')
@RequirePermissions(PERMISSIONS.RISK_READ)
export class RisksController {
  constructor(private readonly service: RisksService) {}

  @Get()
  list(@Query() query: ListRisksQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RISK_CREATE)
  create(@Body() dto: CreateRiskDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RISK_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateRiskDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.RISK_DELETE)
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }
}
