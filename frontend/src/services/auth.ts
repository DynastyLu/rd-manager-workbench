import * as request from '@/lib/request'
import type { UserInfo } from '@/types/user'

export interface LoginPayload {
  username: string
  password: string
}

export interface LoginResult {
  accessToken: string
  user: UserInfo
}

export interface RefreshResult {
  accessToken: string
}

export const authService = {
  /** POST /api/auth/login → { accessToken, user } */
  login: (payload: LoginPayload) => request.post<LoginResult>('/api/auth/login', payload),

  /** POST /api/auth/logout */
  logout: () => request.post<void>('/api/auth/logout', {}),

  /** POST /api/auth/refresh → { accessToken } */
  refresh: () => request.post<RefreshResult>('/api/auth/refresh', {}),

  /** GET /api/auth/me → UserInfo */
  me: () => request.get<UserInfo>('/api/auth/me'),
}
