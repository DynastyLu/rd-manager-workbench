import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OwnershipMigrationService } from '../../application/ownership-migration.service';
import type { AuthenticatedPrincipal } from '../../domain/principal';
import { CurrentUser } from './current-user.decorator';
import {
  AnalyzeOwnershipMigrationDto,
  ApplyOwnershipMigrationDto,
  BulkAssignOwnershipDto,
  ListUnresolvedOwnershipMigrationDto,
} from './dto/ownership.dto';
import { PERMISSIONS, RequirePermissions } from './permissions.decorator';

@Controller('admin/ownership-migration')
@RequirePermissions(PERMISSIONS.SYSTEM_CONFIGURE)
export class AdminOwnershipMigrationController {
  constructor(private readonly migration: OwnershipMigrationService) {}

  @Get('status')
  status() {
    return this.migration.getStatus();
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@Body() input: AnalyzeOwnershipMigrationDto) {
    return this.migration.analyze(input.cursor, input.batchSize);
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  apply(
    @Body() input: ApplyOwnershipMigrationDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ) {
    return this.migration.apply(
      input.idempotencyKey,
      principal.userId,
      principal.username,
    );
  }

  @Get('unresolved')
  unresolved(@Query() input: ListUnresolvedOwnershipMigrationDto) {
    return this.migration.listUnresolved(input.cursor, input.batchSize);
  }

  @Put('assignments')
  assignments(
    @Body() input: BulkAssignOwnershipDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ) {
    return this.migration.bulkAssign(
      input.assignments,
      principal.userId,
      principal.username,
    );
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  complete() {
    return this.migration.complete();
  }
}
