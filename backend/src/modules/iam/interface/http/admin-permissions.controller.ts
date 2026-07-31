import { Controller, Get } from '@nestjs/common';
import { RolesService } from '../../application/roles.service';
import { PERMISSIONS, RequirePermissions } from './permissions.decorator';

@Controller('admin/permissions')
@RequirePermissions(PERMISSIONS.ROLE_READ)
export class AdminPermissionsController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list() {
    return this.roles.listPermissions();
  }
}
