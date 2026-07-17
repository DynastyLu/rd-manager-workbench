import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { User } from '../domain/user.entity';
import type { UserRepository } from '../domain/user.repository';

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async create(input: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async list(tenantId?: string): Promise<User[]> {
    const users = Array.from(this.users.values());
    return tenantId ? users.filter((user) => user.tenantId === tenantId) : users;
  }
}
