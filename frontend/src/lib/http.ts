import { apiUrl } from '@/lib/api-url'
import { useAuthStore } from '@/modules/auth/store'
import type { LoginResponse } from '@/modules/auth/types'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiFailureEnvelope {
  success: false
  error: {
    code?: unknown
    message?: unknown
    details?: unknown
  }
}

interface ApiSuccessEnvelope<T> {
  success: true
  data: T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSuccessEnvelope<T>(value: unknown): value is ApiSuccessEnvelope<T> {
  return isRecord(value) && value.success === true && 'data' in value
}

function isFailureEnvelope(value: unknown): value is ApiFailureEnvelope {
  return isRecord(value) && value.success === false && isRecord(value.error)
}

function getEnvelopeError(payload: ApiFailureEnvelope, status: number): ApiError {
  const code = typeof payload.error.code === 'string' ? payload.error.code : 'API_ERROR'
  const message =
    typeof payload.error.message === 'string' ? payload.error.message : 'The API request failed.'

  return new ApiError(message, status, code, payload.error.details)
}

function getHttpError(response: Response): ApiError {
  const message = response.statusText || `Request failed with status ${response.status}.`
  return new ApiError(message, response.status, `HTTP_${response.status}`)
}

async function parseJson(response: Response): Promise<unknown> {
  const responseText = await response.text()

  if (!responseText) {
    return undefined
  }

  try {
    return JSON.parse(responseText) as unknown
  } catch {
    throw new ApiError('The API returned malformed JSON.', response.status, 'MALFORMED_RESPONSE')
  }
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path)
  try {
    return await fetch(url, withAuthentication(path, init))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Network request failed.'
    throw new ApiError(message, 0, 'NETWORK_ERROR')
  }
}

function withAuthentication(path: string, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')

  if (
    init?.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  const { accessToken, csrfToken } = useAuthStore.getState()
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  if (csrfToken && isCsrfProtectedAuthPath(path) && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  return {
    ...init,
    credentials: 'include',
    headers,
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const payload = await parseJson(response)

  if (isFailureEnvelope(payload)) {
    throw getEnvelopeError(payload, response.status)
  }

  if (!response.ok) {
    throw getHttpError(response)
  }

  if (!isSuccessEnvelope<T>(payload)) {
    throw new ApiError(
      'The API returned an invalid response envelope.',
      response.status,
      'MALFORMED_RESPONSE'
    )
  }

  return payload.data
}

async function executeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return parseApiResponse<T>(await fetchApi(path, init))
}

interface AuthSnapshot {
  authEpoch: number
  accessToken?: string
  userId?: string
}

interface RefreshFlight {
  snapshot: AuthSnapshot
  controller: AbortController
  promise: Promise<boolean>
}

interface TokenRotation {
  authEpoch: number
  userId?: string
  fromAccessToken?: string
  toAccessToken: string
}

let refreshFlight: RefreshFlight | undefined
let lastTokenRotation: TokenRotation | undefined

useAuthStore.subscribe((state, previousState) => {
  if (state.authEpoch === previousState.authEpoch) return
  lastTokenRotation = undefined
  refreshFlight?.controller.abort()
})

async function refreshAccessToken(snapshot: AuthSnapshot): Promise<boolean> {
  if (refreshFlight && sameSnapshot(refreshFlight.snapshot, snapshot)) {
    return refreshFlight.promise
  }

  const controller = new AbortController()
  const flight: RefreshFlight = {
    snapshot,
    controller,
    promise: Promise.resolve(false),
  }
  flight.promise = (async () => {
    try {
      const session = await executeRequest<LoginResponse>('/auth/refresh', {
        method: 'POST',
        signal: controller.signal,
      })
      const applied = useAuthStore.getState().applyRefresh(session, snapshot)
      if (applied) {
        lastTokenRotation = {
          authEpoch: snapshot.authEpoch,
          userId: snapshot.userId,
          fromAccessToken: snapshot.accessToken,
          toAccessToken: session.accessToken,
        }
      }
      return applied
    } catch (error) {
      clearSessionForSnapshot(snapshot)
      throw error
    } finally {
      if (refreshFlight === flight) refreshFlight = undefined
    }
  })()
  refreshFlight = flight
  return flight.promise
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  cancelRefreshForIdentityBoundary(path)
  const initialSnapshot = authSnapshot()
  try {
    return await executeRequest<T>(path, init)
  } catch (error) {
    if (!shouldRefresh(path, error)) {
      if (isTerminalSessionError(error)) clearSessionForSnapshot(initialSnapshot)
      throw error
    }
    if (!(await ensureFreshAccessToken(initialSnapshot))) throw error
    const retrySnapshot = authSnapshot()
    try {
      return await executeRequest<T>(path, init)
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) {
        clearSessionForSnapshot(retrySnapshot)
      }
      throw retryError
    }
  }
}

export async function download(
  path: string,
  init?: RequestInit
): Promise<{ blob: Blob; fileName: string }> {
  cancelRefreshForIdentityBoundary(path)
  const initialSnapshot = authSnapshot()
  try {
    return await executeDownload(path, init)
  } catch (error) {
    if (!shouldRefresh(path, error)) {
      if (isTerminalSessionError(error)) clearSessionForSnapshot(initialSnapshot)
      throw error
    }
    if (!(await ensureFreshAccessToken(initialSnapshot))) throw error
    const retrySnapshot = authSnapshot()
    try {
      return await executeDownload(path, init)
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) {
        clearSessionForSnapshot(retrySnapshot)
      }
      throw retryError
    }
  }
}

/**
 * Low-level fetch that attaches the current access token and sends cookies.
 * Use this for endpoints that must bypass the JSON envelope client
 * (binary files, streams, or direct downloads).
 */
export function authenticatedFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const { accessToken } = useAuthStore.getState()
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return fetch(input, { ...init, credentials: 'include', headers })
}

/**
 * Fetch a binary file with authentication and trigger a browser download.
 * Reads the filename from Content-Disposition when available.
 */
export async function downloadAuthenticated(url: string, fileName?: string): Promise<void> {
  const response = await authenticatedFetch(url)
  if (!response.ok) {
    const payload = await parseJson(response)
    if (isFailureEnvelope(payload)) {
      throw getEnvelopeError(payload, response.status)
    }
    throw getHttpError(response)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl

  const disposition = response.headers.get('Content-Disposition')
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const fallback = disposition?.match(/filename="([^"]+)"/i)?.[1]
  link.download = fileName || (encoded ? decodeURIComponent(encoded) : fallback) || 'download'

  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
}

async function ensureFreshAccessToken(snapshot: AuthSnapshot): Promise<boolean> {
  const current = authSnapshot()
  if (current.authEpoch !== snapshot.authEpoch || current.userId !== snapshot.userId) {
    return false
  }
  if (current.accessToken !== snapshot.accessToken) {
    return (
      lastTokenRotation?.authEpoch === snapshot.authEpoch &&
      lastTokenRotation.userId === snapshot.userId &&
      lastTokenRotation.fromAccessToken === snapshot.accessToken &&
      lastTokenRotation.toAccessToken === current.accessToken
    )
  }
  return refreshAccessToken(snapshot)
}

async function executeDownload(
  path: string,
  init?: RequestInit
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetchApi(path, init)
  if (!response.ok) {
    const payload = await parseJson(response)
    if (isFailureEnvelope(payload)) {
      throw getEnvelopeError(payload, response.status)
    }
    throw getHttpError(response)
  }
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const fallback = disposition.match(/filename="([^"]+)"/i)?.[1]
  return {
    blob: await response.blob(),
    fileName: encoded ? decodeURIComponent(encoded) : fallback || 'download',
  }
}

function isCsrfProtectedAuthPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '')
  return normalized === 'auth/refresh' || normalized === 'auth/logout'
}

function isAuthPath(path: string): boolean {
  return path.replace(/^\/+/, '').startsWith('auth/')
}

function isIdentityBoundaryPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '')
  return normalized === 'auth/login' || normalized === 'auth/logout'
}

function cancelRefreshForIdentityBoundary(path: string): void {
  if (isIdentityBoundaryPath(path)) refreshFlight?.controller.abort()
}

function authSnapshot(): AuthSnapshot {
  const state = useAuthStore.getState()
  return {
    authEpoch: state.authEpoch,
    accessToken: state.accessToken,
    userId: state.user?.id,
  }
}

function sameSnapshot(left: AuthSnapshot, right: AuthSnapshot): boolean {
  return (
    left.authEpoch === right.authEpoch &&
    left.accessToken === right.accessToken &&
    left.userId === right.userId
  )
}

function clearSessionForSnapshot(snapshot: AuthSnapshot): void {
  const current = authSnapshot()
  if (sameSnapshot(current, snapshot)) {
    useAuthStore.getState().clearSessionIfEpoch(snapshot.authEpoch)
  }
}

function shouldRefresh(path: string, error: unknown): boolean {
  return (
    !isAuthPath(path) &&
    error instanceof ApiError &&
    error.status === 401 &&
    error.code !== 'AUTH_SESSION_REVOKED'
  )
}

function isTerminalSessionError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    [
      'AUTH_REFRESH_INVALID',
      'AUTH_REFRESH_REPLAYED',
      'AUTH_SESSION_NOT_FOUND',
      'AUTH_SESSION_REVOKED',
    ].includes(error.code)
  )
}
