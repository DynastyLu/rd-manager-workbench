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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthorizationService } from '../../application/authorization.service';
import { SecurityAuditService } from '../../application/security-audit.service';
import { UsersService } from '../../application/users.service';
import type { AuthenticatedPrincipal } from '../../domain/principal';
import { CurrentUser } from './current-user.decorator';
import {
  CreateUserDto,
  DeleteUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateUserDto,
} from './dto/users.dto';
import { PERMISSIONS, RequirePermissions } from './permissions.decorator';

@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly authorization: AuthorizationService,
    private readonly securityAudits: SecurityAuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  list(@Query() input: ListUsersQueryDto) {
    return this.users.list(input);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_CREATE, PERMISSIONS.ROLE_ASSIGN)
  create(@Body() input: CreateUserDto, @CurrentUser() principal: AuthenticatedPrincipal) {
    return this.users.create(input, principal.userId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_READ)
  get(@Param('id') userId: string) {
    return this.users.get(userId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  update(
    @Param('id') userId: string,
    @Body() input: UpdateUserDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Req() request: Request,
  ) {
    if (
      input.roleIds !== undefined &&
      !this.authorization.hasPermission(principal, PERMISSIONS.ROLE_ASSIGN)
    ) {
      const userAgent = request.headers['user-agent'];
      return this.securityAudits.denyPermission(principal, [PERMISSIONS.ROLE_ASSIGN], {
        ipAddress: request.ip || request.socket?.remoteAddress,
        userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
      });
    }
    return this.users.update(userId, input, principal.userId);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_DISABLE)
  enable(@Param('id') userId: string) {
    return this.users.enable(userId);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_DISABLE)
  disable(@Param('id') userId: string) {
    return this.users.disable(userId);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  resetPassword(@Param('id') userId: string, @Body() input: ResetUserPasswordDto) {
    return this.users.resetPassword(userId, input.temporaryPassword);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_DISABLE)
  revokeSessions(@Param('id') userId: string) {
    return this.users.revokeAllSessions(userId);
  }

  @Get(':id/sessions')
  @RequirePermissions(PERMISSIONS.USER_READ)
  sessions(@Param('id') userId: string) {
    return this.users.listSessions(userId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_DISABLE)
  delete(@Param('id') userId: string, @Body() input: DeleteUserDto) {
    return this.users.delete(userId, input.confirmNoOwnershipReferences);
  }
}
