import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import type { ExtensionExecutionInput, ExtensionExecutionResult } from '../contracts.js'
import {
  assertSameOriginRedirect,
  basicAuthorization,
  isRetryableHttp,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_MS,
  responseBytesLimited,
  retryDelay,
} from './provider-http.js'

const MAX_DOWNLOAD_BYTES = 750 * 1024
const MAX_UPLOAD_BYTES = 750 * 1024

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function normalizePath(path: unknown): string | undefined {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return undefined
  let decoded: string
  try { decoded = decodeURIComponent(path) } catch { return undefined }
  const normalized = posix.normalize(decoded)
  if (normalized === '..' || normalized.startsWith('../') || decoded.split('/').includes('..')) return undefined
  return normalized === decoded ? normalized : undefined
}

function remoteRootUrl(baseUrl: string, remoteRoot: string): URL | undefined {
  let decoded: string
  try { decoded = decodeURIComponent(remoteRoot) } catch { return undefined }
  if (
    !remoteRoot.startsWith('/')
    || remoteRoot.startsWith('//')
    || decoded.startsWith('//')
    || decoded.includes('\\')
    || decoded.includes('\0')
    || decoded.includes('?')
    || decoded.includes('#')
    || posix.normalize(decoded) !== decoded
  ) return undefined
  try {
    const base = new URL(baseUrl)
    if (base.protocol !== 'https:' && base.protocol !== 'http:') return undefined
    const root = new URL(remoteRoot.endsWith('/') ? remoteRoot : `${remoteRoot}/`, base)
    return root.origin === base.origin ? root : undefined
  } catch {
    return undefined
  }
}

function remoteUrl(baseUrl: string, remoteRoot: string, remotePath: string): string | undefined {
  const root = remoteRootUrl(baseUrl, remoteRoot)
  if (!root) return undefined
  const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/')
  const target = new URL(encodedPath, root)
  if (target.origin !== new URL(baseUrl).origin || !target.pathname.startsWith(root.pathname)) return undefined
  return target.toString()
}

async function davFetch(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
      assertSameOriginRedirect(url, response)
      if (isRetryableHttp(response.status) && attempt < PROVIDER_MAX_ATTEMPTS) {
        await retryDelay(attempt)
        continue
      }
      return response
    } catch (error) {
      if (error instanceof Error && error.message === 'EXTERNAL_CROSS_HOST_REDIRECT') throw error
      if (attempt >= PROVIDER_MAX_ATTEMPTS) throw error
      await retryDelay(attempt)
    }
  }
  throw new Error('NETWORK_TIMEOUT')
}

function credentialValue(credential: Record<string, unknown> | undefined, key: string) {
  const value = credential?.[key]
  return typeof value === 'string' && value ? value : undefined
}

export async function webDav(
  input: ExtensionExecutionInput,
  credential: Record<string, unknown> | undefined,
): Promise<ExtensionExecutionResult> {
  const username = credentialValue(credential, 'username')
  const password = credentialValue(credential, 'password')
  const baseUrl = typeof input.profile.publicConfig['baseUrl'] === 'string' ? input.profile.publicConfig['baseUrl'] : undefined
  const remoteRoot = typeof input.profile.publicConfig['remoteRoot'] === 'string' ? input.profile.publicConfig['remoteRoot'] : undefined
  if (!username || !password) return { status: 'REJECTED', errorCode: 'CREDENTIAL_NOT_FOUND' }
  if (!baseUrl || !remoteRoot) return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
  const root = remoteRootUrl(baseUrl, remoteRoot)
  if (!root) return { status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' }
  const rootUrl = root.toString()
  const authorization = basicAuthorization(username, password)
  try {
    if (input.operation === 'TEST_CONNECTION') {
      const response = await davFetch(rootUrl, {
        method: 'PROPFIND',
        headers: { authorization, depth: '0', 'content-type': 'application/xml; charset=utf-8' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
      })
      return response.ok || response.status === 207
        ? { status: 'SUCCEEDED', metadata: { remoteRoot: new URL(rootUrl).pathname } }
        : { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } }
    }
    const path = normalizePath(input.payload['remotePath'])
    if (!path) return { status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' }
    const url = remoteUrl(baseUrl, remoteRoot, path)
    if (!url) return { status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' }

    if (input.operation === 'CLOUD_UPLOAD_PREFLIGHT' || input.operation === 'CLOUD_DOWNLOAD_PREFLIGHT') {
      const response = await davFetch(url, { method: 'HEAD', headers: { authorization } })
      if (response.status === 404) return { status: 'SUCCEEDED', output: { action: 'ADD', remotePath: path } }
      if (!response.ok) return { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } }
      const remoteVersion = response.headers.get('etag') ?? undefined
      const remoteHash = response.headers.get('x-content-sha256') ?? undefined
      const expectedVersion = typeof input.payload['remoteVersion'] === 'string' ? input.payload['remoteVersion'] : undefined
      const localHash = typeof input.payload['localHash'] === 'string' ? input.payload['localHash'] : undefined
      const conflict = Boolean(
        (expectedVersion && remoteVersion && expectedVersion !== remoteVersion)
        || (localHash && remoteHash && localHash !== remoteHash),
      )
      return {
        status: 'SUCCEEDED',
        output: { action: conflict ? 'CONFLICT' : 'UPDATE', remotePath: path, remoteVersion, remoteHash },
      }
    }

    if (input.operation === 'CLOUD_UPLOAD_COMMIT') {
      const contentBase64 = typeof input.payload['contentBase64'] === 'string' ? input.payload['contentBase64'] : undefined
      const expectedHash = typeof input.payload['sha256'] === 'string' ? input.payload['sha256'] : undefined
      if (!contentBase64 || !expectedHash) return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
      const bytes = Buffer.from(contentBase64, 'base64')
      if (bytes.byteLength > MAX_UPLOAD_BYTES || sha256(bytes) !== expectedHash) {
        return { status: 'REJECTED', errorCode: 'FILE_INTEGRITY_FAILED' }
      }
      const remoteVersion = typeof input.payload['remoteVersion'] === 'string' ? input.payload['remoteVersion'] : undefined
      const response = await davFetch(url, {
        method: 'PUT',
        headers: {
          authorization,
          'content-type': 'application/octet-stream',
          'x-content-sha256': expectedHash,
          ...(remoteVersion ? { 'if-match': remoteVersion } : { 'if-none-match': '*' }),
        },
        body: bytes,
      })
      if (response.status === 409 || response.status === 412) {
        return { status: 'REJECTED', errorCode: 'EXTERNAL_SYNC_CONFLICT' }
      }
      if (!response.ok) return { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } }
      return { status: 'SUCCEEDED', output: { remotePath: path, remoteVersion: response.headers.get('etag') ?? undefined, sha256: expectedHash } }
    }

    if (input.operation === 'CLOUD_DOWNLOAD_COMMIT') {
      const expectedVersion = typeof input.payload['expectedVersion'] === 'string'
        ? input.payload['expectedVersion']
        : undefined
      const response = await davFetch(url, {
        method: 'GET',
        headers: { authorization, ...(expectedVersion ? { 'if-match': expectedVersion } : {}) },
      })
      if (response.status === 409 || response.status === 412) {
        return { status: 'REJECTED', errorCode: 'EXTERNAL_SYNC_CONFLICT' }
      }
      if (!response.ok) return { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } }
      const bytes = await responseBytesLimited(response, MAX_DOWNLOAD_BYTES)
      const digest = sha256(bytes)
      const expectedHash = typeof input.payload['expectedHash'] === 'string' ? input.payload['expectedHash'] : undefined
      if (expectedHash && expectedHash !== digest) return { status: 'REJECTED', errorCode: 'EXTERNAL_SYNC_CONFLICT' }
      const remoteVersion = response.headers.get('etag') ?? undefined
      if (expectedVersion && remoteVersion !== expectedVersion) {
        return { status: 'REJECTED', errorCode: 'EXTERNAL_SYNC_CONFLICT' }
      }
      return {
        status: 'SUCCEEDED',
        output: { remotePath: path, remoteVersion, sha256: digest, contentBase64: Buffer.from(bytes).toString('base64') },
      }
    }
    return { status: 'REJECTED', errorCode: 'EXTENSION_OPERATION_UNSUPPORTED' }
  } catch (error) {
    return { status: 'FAILED', errorCode: error instanceof Error ? error.message : 'NETWORK_TIMEOUT', metadata: { retryable: false } }
  }
}
