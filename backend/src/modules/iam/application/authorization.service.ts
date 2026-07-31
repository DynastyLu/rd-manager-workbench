import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal, PrincipalDataScope } from '../domain/principal';

const SCOPE_ORDER: readonly PrincipalDataScope[] = [
  'SELF',
  'INVOLVED',
  'DEPARTMENT',
  'PROJECT',
  'ALL',
];

export interface ResolvedPermissionScope {
  kinds: PrincipalDataScope[];
  departmentNames?: string[];
  projectIds?: string[];
}

@Injectable()
export class AuthorizationService {
  hasPermission(principal: AuthenticatedPrincipal, permissionCode: string): boolean {
    return (
      principal.roleCodes.includes('SUPER_ADMIN') ||
      principal.permissions.some(({ code }) => code === permissionCode)
    );
  }

  resolveScope(principal: AuthenticatedPrincipal, permissionCode: string): ResolvedPermissionScope {
    if (principal.roleCodes.includes('SUPER_ADMIN')) {
      return { kinds: ['ALL'] };
    }

    const grants = principal.permissions.filter(({ code }) => code === permissionCode);
    if (grants.some(({ dataScope }) => dataScope === 'ALL')) {
      return { kinds: ['ALL'] };
    }

    const kinds = new Set<PrincipalDataScope>();
    const departmentNames = new Set<string>();
    const projectIds = new Set<string>();
    for (const grant of grants) {
      kinds.add(grant.dataScope);
      addStrings(departmentNames, grant.scopeConfig?.departmentNames);
      addStrings(projectIds, grant.scopeConfig?.projectIds);
    }

    return {
      kinds: SCOPE_ORDER.filter((scope) => kinds.has(scope)),
      ...(departmentNames.size > 0
        ? { departmentNames: [...departmentNames].sort((left, right) => left.localeCompare(right)) }
        : {}),
      ...(projectIds.size > 0
        ? { projectIds: [...projectIds].sort((left, right) => left.localeCompare(right)) }
        : {}),
    };
  }
}

function addStrings(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) target.add(item);
  }
}
