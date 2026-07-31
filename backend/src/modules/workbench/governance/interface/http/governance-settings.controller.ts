import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
import { GovernanceSettingsService } from '../../application/governance-settings.service';
import { UpdateGovernanceSettingsDto } from './dto/governance.dto';

@Controller('governance/settings')
export class GovernanceSettingsController {
  constructor(private readonly settings: GovernanceSettingsService) {}

  @Get()
  @RequirePermissions('system.configure')
  get() {
    return this.settings.get();
  }

  @Put()
  @RequirePermissions('system.configure')
  update(@Body() dto: UpdateGovernanceSettingsDto) {
    return this.settings.update(dto);
  }

  @Patch()
  @RequirePermissions('system.configure')
  patch(@Body() dto: UpdateGovernanceSettingsDto) {
    return this.settings.update(dto);
  }
}
