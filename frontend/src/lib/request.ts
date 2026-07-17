import { config } from '@/lib/config'

/**
 * Centralised HTTP client.
 *
 * Usage:
 *   import * as request from '@/lib/request'
 *   const data = await request.get<User>('/api/auth/me')
 *
 * Wire up auth in AuthProvider:
 *   configureRequest({ getToken: () => accessToken, refresh: refreshAccessToken })
 */

interface RequestHandlers {
  getToken: (() => string | null) | null
  refresh: (() => Promise<string | null>) | null
}

const _handlers: RequestHandlers = { getToken: null, refresh: null }
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:/i

/** Call once from AuthProvider after token state is available. */
export function configureRequest(handlers: RequestHandlers): void {
  _handlers.getToken = handlers.getToken
  _handlers.refresh = handlers.refresh
}

/** Normalised API error thrown on non-2xx responses. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: { error?: string; message?: string; code?: string | null } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    /* non-JSON body */
  }
  return new ApiError(body.error ?? body.message ?? res.statusText, res.status, body.code ?? null)
}

async function _fetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = _handlers.getToken?.()
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const requestUrl = resolveRequestUrl(url)

  const res = await fetch(requestUrl, { ...options, credentials: 'include', headers })

  // Silent token refresh on 401
  if (res.status === 401 && _handlers.refresh) {
    const newToken = await _handlers.refresh()
    if (newToken) {
      const retryHeaders = {
        ...(options.headers as Record<string, string>),
        Authorization: `Bearer ${newToken}`,
      }
      return fetch(requestUrl, { ...options, credentials: 'include', headers: retryHeaders })
    }
  }

  return res
}

function resolveRequestUrl(url: string): string {
  if (ABSOLUTE_URL_RE.test(url) || !url.startsWith('/')) {
    return url
  }

  return `${config.apiBaseUrl.replace(/\/+$/, '')}${url}`
}

export async function get<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await _fetch(url, { ...options, method: 'GET' })
  if (!res.ok) throw await toApiError(res)
  return res.json() as Promise<T>
}

export async function post<T = unknown>(
  url: string,
  body: unknown,
  options: RequestInit = {}
): Promise<T> {
  const res = await _fetch(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await toApiError(res)
  return res.json() as Promise<T>
}

export async function patch<T = unknown>(
  url: string,
  body: unknown,
  options: RequestInit = {}
): Promise<T> {
  const res = await _fetch(url, {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await toApiError(res)
  return res.json() as Promise<T>
}

export async function del<T = unknown>(url: string, options: RequestInit = {}): Promise<T | null> {
  const res = await _fetch(url, { ...options, method: 'DELETE' })
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return null
  return res.json() as Promise<T>
}

/** For multipart/form-data (file upload). Do NOT set Content-Type — browser sets it with boundary. */
export async function postForm<T = unknown>(
  url: string,
  formData: FormData,
  options: RequestInit = {}
): Promise<T> {
  const res = await _fetch(url, { ...options, method: 'POST', body: formData })
  if (!res.ok) throw await toApiError(res)
  return res.json() as Promise<T>
}

/** Raw response — for blob downloads. */
export async function getBlob(url: string, options: RequestInit = {}): Promise<Blob> {
  const res = await _fetch(url, { ...options, method: 'GET' })
  if (!res.ok) throw await toApiError(res)
  return res.blob()
}

export async function postBlob(
  url: string,
  body: unknown,
  options: RequestInit = {}
): Promise<Blob> {
  const res = await _fetch(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await toApiError(res)
  return res.blob()
}
