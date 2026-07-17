import type { Role } from './role.entity';

export const ROLE_REPOSITORY = 'ROLE_REPOSITORY';

export interface RoleRepository {
  create(input: Omit<Role, 'id' | 'createdAt'>): Promise<Role>;
  list(tenantId?: string): Promise<Role[]>;
}
