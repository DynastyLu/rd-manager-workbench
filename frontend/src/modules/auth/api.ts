import { request } from '@/lib/http'
import type {
  AuthSession,
  ChangePasswordInput,
  ChangePasswordResponse,
  ConnectionTicketAudience,
  ConnectionTicketResponse,
  CsrfResponse,
  CurrentUser,
  LoginInput,
  LoginResponse,
} from '@/modules/auth/types'

export function getCsrfToken(): Promise<CsrfResponse> {
  return request<CsrfResponse>('/auth/csrf')
}

export function refreshSession(csrfToken: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/refresh', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
  })
}

export function getMe(): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/me')
}

export function getConnectionTicket(
  audience: ConnectionTicketAudience
): Promise<ConnectionTicketResponse> {
  return request<ConnectionTicketResponse>('/auth/connection-tickets', {
    method: 'POST',
    body: JSON.stringify({ audience }),
  })
}

export function login(input: LoginInput): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function logout(): Promise<{ loggedOut: boolean }> {
  return request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' })
}

export function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResponse> {
  return request<ChangePasswordResponse>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listSessions(): Promise<AuthSession[]> {
  return request<AuthSession[]>('/auth/sessions')
}

export function revokeSession(sessionId: string): Promise<{ revoked: boolean }> {
  return request<{ revoked: boolean }>(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export function revokeAllSessions(): Promise<{ revoked: number }> {
  return request<{ revoked: number }>('/auth/sessions', { method: 'DELETE' })
}
