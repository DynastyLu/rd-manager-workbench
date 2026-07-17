import type { User } from './user.entity';

export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface UserRepository {
  create(input: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  list(tenantId?: string): Promise<User[]>;
}
