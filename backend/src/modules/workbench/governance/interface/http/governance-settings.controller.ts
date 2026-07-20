import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { GovernanceSettingsService } from '../../application/governance-settings.service';
import { UpdateGovernanceSettingsDto } from './dto/governance.dto';

@Controller('governance/settings')
export class GovernanceSettingsController {
  constructor(private readonly settings: GovernanceSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  update(@Body() dto: UpdateGovernanceSettingsDto) {
    return this.settings.update(dto);
  }

  @Patch()
  patch(@Body() dto: UpdateGovernanceSettingsDto) {
    return this.settings.update(dto);
  }
}
