import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { RolesService } from '../../application/roles.service';
import {
  CopyRoleDto,
  CreateRoleDto,
  ReplaceRolePermissionsDto,
  UpdateRoleDto,
} from './dto/roles.dto';
import { PERMISSIONS, RequirePermissions } from './permissions.decorator';

@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  list() {
    return this.roles.listRoles();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLE_CREATE)
  create(@Body() input: CreateRoleDto) {
    return this.roles.create(input);
  }

  @Post(':id/copy')
  @RequirePermissions(PERMISSIONS.ROLE_CREATE)
  copy(@Param('id') roleId: string, @Body() input: CopyRoleDto) {
    return this.roles.copy(roleId, input);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE_UPDATE)
  update(@Param('id') roleId: string, @Body() input: UpdateRoleDto) {
    return this.roles.update(roleId, input);
  }

  @Put(':id/permissions')
  @RequirePermissions(PERMISSIONS.ROLE_UPDATE)
  replacePermissions(@Param('id') roleId: string, @Body() input: ReplaceRolePermissionsDto) {
    return this.roles.replacePermissions(roleId, input.permissions);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROLE_UPDATE)
  delete(@Param('id') roleId: string) {
    return this.roles.delete(roleId);
  }
}
