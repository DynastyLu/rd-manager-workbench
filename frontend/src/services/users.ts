import * as request from '@/lib/request'
import type { UserInfo, UserRole } from '@/types/user'

export interface CreateUserPayload {
  username: string
  password: string
  role: UserRole
}

export const usersService = {
  /** GET /api/auth/users → UserInfo[] */
  list: () => request.get<UserInfo[]>('/api/auth/users'),

  /** POST /api/auth/users → UserInfo */
  create: (payload: CreateUserPayload) => request.post<UserInfo>('/api/auth/users', payload),

  /** PATCH /api/auth/users/:id/role */
  updateRole: (id: string, role: UserRole) =>
    request.patch<UserInfo>(`/api/auth/users/${id}/role`, { role }),

  /** DELETE /api/auth/users/:id */
  remove: (id: string) => request.del(`/api/auth/users/${id}`),
}
