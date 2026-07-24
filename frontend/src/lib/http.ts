import { config } from '@/lib/config'

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

function getApiBaseUrl(): string {
  const configuredBaseUrl = config.apiBaseUrl

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:4311/api'
  }

  throw new Error('VITE_API_BASE_URL is required in production.')
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
  const url = `${getApiBaseUrl()}${path}`
  try {
    return await fetch(url, init)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Network request failed.'
    throw new ApiError(message, 0, 'NETWORK_ERROR')
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')

  if (
    init?.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchApi(path, { ...init, headers })

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

export async function download(
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
