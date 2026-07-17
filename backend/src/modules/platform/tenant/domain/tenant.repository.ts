import { Tenant } from './tenant.entity';

export const TENANT_REPOSITORY = 'TENANT_REPOSITORY';

export interface TenantRepository {
  create(input: Omit<Tenant, 'id' | 'createdAt' | 'schemaName'>): Promise<Tenant>;
  list(): Promise<Tenant[]>;
  findByKey(key: string): Promise<Tenant | undefined>;
}
