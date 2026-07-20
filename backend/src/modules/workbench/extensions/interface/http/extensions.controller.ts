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
import { ExtensionKind } from '@prisma/client';
import { ExtensionsService } from '../../application/extensions.service';
import { SmsDeliveryService } from '../../application/sms-delivery.service';
import { AiContextService } from '../../application/ai-context.service';
import { AiAdoptionService } from '../../application/ai-adoption.service';
import {
  ExternalSyncService,
} from '../../application/external-sync.service';
import {
  CompleteExtensionRunDto,
  CreateExtensionProfileDto,
  PrepareExtensionRunDto,
  StartExtensionRunDto,
  UpdateExtensionProfileDto,
  CreateSmsRecipientDto,
  UpdateSmsRecipientDto,
  PrepareAiRequestDto,
  SyncPrepareDto,
  SyncSessionCommitDto,
  SyncStartDto,
  AdoptAiDto,
} from './dto/extensions.dto';

@Controller('extensions/profiles')
export class ExtensionProfilesController {
  constructor(private readonly extensions: ExtensionsService) {}

  @Get()
  list(@Query('kind') kind?: ExtensionKind) {
    return this.extensions.listProfiles(kind);
  }

  @Post()
  create(@Body() dto: CreateExtensionProfileDto) {
    return this.extensions.createProfile(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.extensions.getProfile(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExtensionProfileDto) {
    return this.extensions.updateProfile(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(@Param('id') id: string) {
    return this.extensions.archiveProfile(id);
  }

  @Post(':id/runs/prepare')
  prepare(@Param('id') id: string, @Body() dto: PrepareExtensionRunDto) {
    return this.extensions.prepareRun(id, dto);
  }

  @Post(':id/runs')
  start(@Param('id') id: string, @Body() dto: StartExtensionRunDto) {
    return this.extensions.startRun(id, dto);
  }
}

@Controller('extensions/runs')
export class ExtensionRunsController {
  constructor(private readonly extensions: ExtensionsService) {}

  @Get()
  list(@Query('profileId') profileId?: string) {
    return this.extensions.listRuns(profileId);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() dto: CompleteExtensionRunDto) {
    return this.extensions.completeRun(id, dto);
  }
}

@Controller('extensions/sms')
export class ExtensionSmsController {
  constructor(private readonly sms: SmsDeliveryService) {}

  @Get('recipients')
  recipients() {
    return this.sms.listRecipients();
  }

  @Post('recipients')
  createRecipient(@Body() dto: CreateSmsRecipientDto) {
    return this.sms.createRecipient(dto);
  }

  @Patch('recipients/:id')
  updateRecipient(@Param('id') id: string, @Body() dto: UpdateSmsRecipientDto) {
    return this.sms.updateRecipient(id, dto);
  }

  @Delete('recipients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveRecipient(@Param('id') id: string) {
    return this.sms.archiveRecipient(id);
  }

  @Get('deliveries')
  deliveries() {
    return this.sms.listDeliveries();
  }
}

@Controller('extensions/ai')
export class ExtensionAiController {
  constructor(
    private readonly ai: AiContextService,
    private readonly adoption: AiAdoptionService,
  ) {}

  @Post('prepare')
  prepare(@Body() dto: PrepareAiRequestDto) {
    return this.ai.prepare(dto.profileId, dto);
  }

  @Post('adopt')
  adopt(@Body() dto: AdoptAiDto) {
    return this.adoption.adopt(dto);
  }
}

@Controller('extensions/sync')
export class ExtensionSyncController {
  constructor(private readonly sync: ExternalSyncService) {}

  @Post('prepare')
  prepare(@Body() dto: SyncPrepareDto) {
    return this.sync.prepare(dto);
  }

  @Post('preflights/:id/start')
  start(@Param('id') id: string, @Body() dto: SyncStartDto) {
    return this.sync.startPreflight(id, dto.confirmationHash);
  }

  @Get('preflights/:id')
  get(@Param('id') id: string) {
    return this.sync.getSession(id);
  }

  @Post('preflights/:id/commit')
  commit(@Param('id') id: string, @Body() dto: SyncSessionCommitDto) {
    return this.sync.commit(id, dto);
  }
}
