import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Role } from '../domain/role.entity';
import type { RoleRepository } from '../domain/role.repository';

@Injectable()
export class InMemoryRoleRepository implements RoleRepository {
  private readonly roles = new Map<string, Role>();

  async create(input: Omit<Role, 'id' | 'createdAt'>): Promise<Role> {
    const role: Role = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.roles.set(role.id, role);
    return role;
  }

  async list(tenantId?: string): Promise<Role[]> {
    const roles = Array.from(this.roles.values());
    return tenantId ? roles.filter((role) => role.tenantId === tenantId) : roles;
  }
}
