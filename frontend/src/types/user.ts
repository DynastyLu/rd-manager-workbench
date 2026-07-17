import type { Role } from '@/constants/roles'

export type UserRole = Role

export interface UserInfo {
  id: string
  username: string
  role: UserRole
}
