import type { ExtensionExecutionInput, ExtensionExecutionResult } from '../contracts.js'
import {
  assertSameOriginRedirect,
  basicAuthorization,
  isRetryableHttp,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_MS,
  responseTextLimited,
  retryDelay,
} from './provider-http.js'

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function xmlDecode(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function calDavDate(value: string): string | undefined {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function credentialValue(credential: Record<string, unknown> | undefined, key: string) {
  const value = credential?.[key]
  return typeof value === 'string' && value ? value : undefined
}

function calendarCollectionUrl(baseUrl: string, calendarPath: string): string | undefined {
  let decoded: string
  try { decoded = decodeURIComponent(calendarPath) } catch { return undefined }
  if (!calendarPath.startsWith('/') || calendarPath.startsWith('//') || decoded.startsWith('//') || decoded.includes('\\') || decoded.includes('\0') || decoded.includes('?') || decoded.includes('#')) return undefined
  try {
    const base = new URL(baseUrl)
    if (base.protocol !== 'https:' && base.protocol !== 'http:') return undefined
    const collection = new URL(calendarPath, base)
    return collection.origin === base.origin ? collection.toString() : undefined
  } catch {
    return undefined
  }
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

function parseCalendarResponses(xml: string) {
  const responses = xml.match(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/gi) ?? []
  return responses.map((block) => {
    const href = block.match(/<(?:\w+:)?href\b[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/i)?.[1]
    const etag = block.match(/<(?:\w+:)?getetag\b[^>]*>([\s\S]*?)<\/(?:\w+:)?getetag>/i)?.[1]
    const calendarData = block.match(/<(?:\w+:)?calendar-data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/i)?.[1]
    return href
      ? { remoteId: xmlDecode(href.trim()), remoteVersion: etag ? xmlDecode(etag.trim()) : undefined, ical: calendarData ? xmlDecode(calendarData.trim()) : undefined }
      : undefined
  }).filter((item): item is NonNullable<typeof item> => Boolean(item))
}

export async function calDav(
  input: ExtensionExecutionInput,
  credential: Record<string, unknown> | undefined,
): Promise<ExtensionExecutionResult> {
  const username = credentialValue(credential, 'username')
  const password = credentialValue(credential, 'password')
  const baseUrl = typeof input.profile.publicConfig['baseUrl'] === 'string' ? input.profile.publicConfig['baseUrl'] : undefined
  const calendarPath = typeof input.profile.publicConfig['calendarPath'] === 'string' ? input.profile.publicConfig['calendarPath'] : undefined
  if (!username || !password) return { status: 'REJECTED', errorCode: 'CREDENTIAL_NOT_FOUND' }
  if (!baseUrl || !calendarPath) return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
  const calendarUrl = calendarCollectionUrl(baseUrl, calendarPath)
  if (!calendarUrl) return { status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' }
  const headers = { authorization: basicAuthorization(username, password) }
  try {
    if (input.operation === 'TEST_CONNECTION') {
      const response = await davFetch(calendarUrl, {
        method: 'PROPFIND',
        headers: { ...headers, depth: '0', 'content-type': 'application/xml; charset=utf-8' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
      })
      return response.ok || response.status === 207
        ? { status: 'SUCCEEDED', metadata: { calendarUrl: new URL(calendarUrl).pathname } }
        : { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } }
    }
    if (input.operation === 'CALENDAR_SYNC_PREFLIGHT') {
      const startAt = typeof input.payload['startAt'] === 'string' ? calDavDate(input.payload['startAt']) : undefined
      const endAt = typeof input.payload['endAt'] === 'string' ? calDavDate(input.payload['endAt']) : undefined
      if (!startAt || !endAt) return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
      const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${xmlEscape(startAt)}" end="${xmlEscape(endAt)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
      const response = await davFetch(calendarUrl, {
        method: 'REPORT',
        headers: { ...headers, depth: '1', 'content-type': 'application/xml; charset=utf-8' },
        body,
      })
      if (response.status !== 207 && !response.ok) return { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } }
      const xml = await responseTextLimited(response, 8 * 1024 * 1024)
      return { status: 'SUCCEEDED', output: { items: parseCalendarResponses(xml) }, metadata: { direction: 'PULL_ONLY' } }
    }
    if (input.operation === 'CALENDAR_SYNC_COMMIT') {
      const items = input.payload['items']
      if (!Array.isArray(items)) return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
      if (items.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || (item as Record<string, unknown>)['localType'] !== 'CALENDAR_EVENT')) {
        return { status: 'REJECTED', errorCode: 'CALENDAR_DERIVED_EVENT_READ_ONLY' }
      }
      if (input.profile.publicConfig['syncDirection'] !== 'BIDIRECTIONAL') {
        return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIRMATION_REQUIRED' }
      }
      const results = []
      for (const rawItem of items) {
        const item = rawItem as Record<string, unknown>
        const remoteId = typeof item['remoteId'] === 'string' ? item['remoteId'] : undefined
        const ical = typeof item['ical'] === 'string' ? item['ical'] : undefined
        if (!remoteId || !ical || Buffer.byteLength(ical, 'utf8') > 1024 * 1024) {
          return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
        }
        const collectionUrl = new URL(calendarUrl)
        const itemUrl = new URL(remoteId, collectionUrl)
        if (itemUrl.origin !== collectionUrl.origin) return { status: 'REJECTED', errorCode: 'EXTERNAL_CROSS_HOST_REDIRECT' }
        const collectionRoot = collectionUrl.pathname.endsWith('/')
          ? collectionUrl.pathname
          : `${collectionUrl.pathname}/`
        if (!itemUrl.pathname.startsWith(collectionRoot)) {
          return { status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' }
        }
        const response = await davFetch(itemUrl.toString(), {
          method: 'PUT',
          headers: {
            ...headers,
            'content-type': 'text/calendar; charset=utf-8',
            ...(typeof item['remoteVersion'] === 'string' ? { 'if-match': item['remoteVersion'] } : {}),
          },
          body: ical,
        })
        if (!response.ok) return { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } }
        results.push({ remoteId, remoteVersion: response.headers.get('etag') ?? undefined })
      }
      return { status: 'SUCCEEDED', output: { items: results }, metadata: { count: results.length } }
    }
    return { status: 'REJECTED', errorCode: 'EXTENSION_OPERATION_UNSUPPORTED' }
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'NETWORK_TIMEOUT'
    return { status: 'FAILED', errorCode, metadata: { retryable: false } }
  }
}
