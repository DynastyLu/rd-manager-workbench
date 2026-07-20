import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { BackupsService } from '../../application/backups.service';
import { RestorePreflightService } from '../../application/restore-preflight.service';
import { CreateBackupDto, ListBackupsQueryDto } from './dto/governance.dto';

@Controller('governance/backups')
export class BackupsController {
  constructor(
    private readonly backups: BackupsService,
    private readonly restorePreflight: RestorePreflightService,
  ) {}

  @Post()
  create(@Body() dto: CreateBackupDto) {
    void dto;
    return this.backups.createManual();
  }

  @Get()
  list(@Query() query: ListBackupsQueryDto) {
    return this.backups.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.backups.get(id);
  }

  @Post(':id/verify')
  verify(@Param('id') id: string) {
    return this.backups.verify(id);
  }

  @Post(':id/preflight')
  preflight(@Param('id') id: string) {
    return this.restorePreflight.create(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.backups.remove(id);
  }
}
