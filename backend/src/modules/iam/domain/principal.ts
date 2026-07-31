export type PrincipalDataScope = 'SELF' | 'INVOLVED' | 'DEPARTMENT' | 'PROJECT' | 'ALL';

export interface PrincipalPermission {
  code: string;
  dataScope: PrincipalDataScope;
  scopeConfig: Record<string, unknown> | null;
}

export interface AuthenticatedPrincipal {
  userId: string;
  employeeId: string;
  username: string;
  sessionId: string;
  mustChangePassword: boolean;
  roleCodes: readonly string[];
  permissions: readonly PrincipalPermission[];
  permissionVersion: number;
}

export interface SessionMeta {
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedSession {
  sessionId: string;
  userId: string;
  rawRefreshToken: string;
  csrfToken: string;
  expiresAt: Date;
}
