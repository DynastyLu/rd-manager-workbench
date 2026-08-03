import { Injectable } from '@nestjs/common';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { AuthorizationService } from '../../../iam/application/authorization.service';
import { SecurityAuditService } from '../../../iam/application/security-audit.service';
import type { PermissionDeniedMeta } from '../../../iam/application/security-audit.service';
import type { PermissionCode } from '../../../iam/domain/permission-catalog';

@Injectable()
export class EmployeeImportAccessService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly authorization: AuthorizationService,
    private readonly securityAudits: SecurityAuditService,
  ) {}

  async assertAll(permissionCode: PermissionCode, meta: PermissionDeniedMeta): Promise<void> {
    const principal = this.requestContext.requirePrincipal();
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) return;

    await this.securityAudits.denyPermission(principal, [permissionCode], meta);
  }
}
