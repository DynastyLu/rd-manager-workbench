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
import { RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
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
  @RequirePermissions('extension.read')
  list(@Query('kind') kind?: ExtensionKind) {
    return this.extensions.listProfiles(kind);
  }

  @Post()
  @RequirePermissions('extension.configure')
  create(@Body() dto: CreateExtensionProfileDto) {
    return this.extensions.createProfile(dto);
  }

  @Get(':id')
  @RequirePermissions('extension.read')
  get(@Param('id') id: string) {
    return this.extensions.getProfile(id);
  }

  @Patch(':id')
  @RequirePermissions('extension.configure')
  update(@Param('id') id: string, @Body() dto: UpdateExtensionProfileDto) {
    return this.extensions.updateProfile(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('extension.configure')
  archive(@Param('id') id: string) {
    return this.extensions.archiveProfile(id);
  }

  @Post(':id/runs/prepare')
  @RequirePermissions('extension.configure')
  prepare(@Param('id') id: string, @Body() dto: PrepareExtensionRunDto) {
    return this.extensions.prepareRun(id, dto);
  }

  @Post(':id/runs')
  @RequirePermissions('extension.configure')
  start(@Param('id') id: string, @Body() dto: StartExtensionRunDto) {
    return this.extensions.startRun(id, dto);
  }
}

@Controller('extensions/runs')
export class ExtensionRunsController {
  constructor(private readonly extensions: ExtensionsService) {}

  @Get()
  @RequirePermissions('extension.read')
  list(@Query('profileId') profileId?: string) {
    return this.extensions.listRuns(profileId);
  }

  @Post(':id/complete')
  @RequirePermissions('extension.configure')
  complete(@Param('id') id: string, @Body() dto: CompleteExtensionRunDto) {
    return this.extensions.completeRun(id, dto);
  }
}

@Controller('extensions/sms')
export class ExtensionSmsController {
  constructor(private readonly sms: SmsDeliveryService) {}

  @Get('recipients')
  @RequirePermissions('extension.read')
  recipients() {
    return this.sms.listRecipients();
  }

  @Post('recipients')
  @RequirePermissions('extension.configure')
  createRecipient(@Body() dto: CreateSmsRecipientDto) {
    return this.sms.createRecipient(dto);
  }

  @Patch('recipients/:id')
  @RequirePermissions('extension.configure')
  updateRecipient(@Param('id') id: string, @Body() dto: UpdateSmsRecipientDto) {
    return this.sms.updateRecipient(id, dto);
  }

  @Delete('recipients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('extension.configure')
  archiveRecipient(@Param('id') id: string) {
    return this.sms.archiveRecipient(id);
  }

  @Get('deliveries')
  @RequirePermissions('extension.read')
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
  @RequirePermissions('extension.configure')
  prepare(@Body() dto: PrepareAiRequestDto) {
    return this.ai.prepare(dto.profileId, dto);
  }

  @Post('adopt')
  @RequirePermissions('extension.configure')
  adopt(@Body() dto: AdoptAiDto) {
    return this.adoption.adopt(dto);
  }
}

@Controller('extensions/sync')
export class ExtensionSyncController {
  constructor(private readonly sync: ExternalSyncService) {}

  @Post('prepare')
  @RequirePermissions('extension.configure')
  prepare(@Body() dto: SyncPrepareDto) {
    return this.sync.prepare(dto);
  }

  @Post('preflights/:id/start')
  @RequirePermissions('extension.configure')
  start(@Param('id') id: string, @Body() dto: SyncStartDto) {
    return this.sync.startPreflight(id, dto.confirmationHash);
  }

  @Get('preflights/:id')
  @RequirePermissions('extension.read')
  get(@Param('id') id: string) {
    return this.sync.getSession(id);
  }

  @Post('preflights/:id/commit')
  @RequirePermissions('extension.configure')
  commit(@Param('id') id: string, @Body() dto: SyncSessionCommitDto) {
    return this.sync.commit(id, dto);
  }
}
