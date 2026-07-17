export interface User {
  id: string;
  tenantId: string;
  tenantKey: string;
  email: string;
  displayName: string;
  roleKeys: string[];
  createdAt: string;
}
