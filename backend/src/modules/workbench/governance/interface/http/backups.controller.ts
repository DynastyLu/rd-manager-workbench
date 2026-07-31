import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
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
  @RequirePermissions('backup.execute')
  create(@Body() dto: CreateBackupDto) {
    void dto;
    return this.backups.createManual();
  }

  @Get()
  @RequirePermissions('backup.read')
  list(@Query() query: ListBackupsQueryDto) {
    return this.backups.list(query);
  }

  @Get(':id')
  @RequirePermissions('backup.read')
  get(@Param('id') id: string) {
    return this.backups.get(id);
  }

  @Post(':id/verify')
  @RequirePermissions('backup.execute')
  verify(@Param('id') id: string) {
    return this.backups.verify(id);
  }

  @Post(':id/preflight')
  @RequirePermissions('restore.execute')
  preflight(@Param('id') id: string) {
    return this.restorePreflight.create(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('backup.execute')
  async remove(@Param('id') id: string) {
    await this.backups.remove(id);
  }
}
