import { TenantStatus } from './tenant-status.enum';

export interface Tenant {
  id: string;
  name: string;
  key: string;
  schemaName: string;
  status: TenantStatus;
  createdAt: string;
}
