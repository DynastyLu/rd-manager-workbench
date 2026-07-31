import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '../../domain/permission-catalog';

export { PERMISSIONS } from '../../domain/permission-catalog';

export const REQUIRED_PERMISSIONS_KEY = 'iam.required-permissions';

export const RequirePermissions = (
  ...permissions: readonly PermissionCode[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSIONS_KEY, [...permissions]);
