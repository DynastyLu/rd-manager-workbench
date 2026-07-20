import { afterEach, describe, expect, it, vi } from 'vitest'
import { calDav } from './caldav.js'

describe('calDav', () => {
  afterEach(() => vi.unstubAllGlobals())
  const profile = {
    id: 'cal-1', kind: 'CALENDAR' as const, provider: 'CALDAV' as const, enabled: true,
    publicConfig: { baseUrl: 'https://dav.example.com', calendarPath: '/cal/', syncDirection: 'PULL_ONLY' },
  }
  const credential = { username: 'user', password: 'secret' }

  it('uses calendar-query REPORT for bounded pull preflight and returns ETag records', async () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/1.ics</d:href><d:propstat><d:prop><d:getetag>"v1"</d:getetag><c:calendar-data>BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nEND:VEVENT\nEND:VCALENDAR</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`
    const fetchMock = vi.fn().mockResolvedValue(new Response(xml, { status: 207 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await calDav({
      runId: 'run-1', profile, operation: 'CALENDAR_SYNC_PREFLIGHT',
      payload: { startAt: '2026-07-20T00:00:00Z', endAt: '2026-07-21T00:00:00Z' },
    }, credential)
    expect(result).toMatchObject({ status: 'SUCCEEDED', output: { items: [{ remoteId: '/cal/1.ics', remoteVersion: '"v1"' }] } })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('REPORT')
    expect(String(init.body)).toContain('calendar-query')
    expect(String(init.body)).toContain('20260720T000000Z')
  })

  it('does not let derived meeting/task events be overwritten remotely', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(calDav({
      runId: 'run-2', profile: { ...profile, publicConfig: { ...profile.publicConfig, syncDirection: 'BIDIRECTIONAL' } },
      operation: 'CALENDAR_SYNC_COMMIT',
      payload: { items: [{ localType: 'MEETING', remoteId: '/cal/1.ics', ical: 'BEGIN:VCALENDAR\nEND:VCALENDAR' }] },
    }, credential)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'CALENDAR_DERIVED_EVENT_READ_ONLY' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects cross-host redirect instead of leaking DAV credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.example/cal' } })))
    await expect(calDav({ runId: 'run-3', profile, operation: 'TEST_CONNECTION', payload: {} }, credential)).resolves.toMatchObject({
      status: 'FAILED', errorCode: 'EXTERNAL_CROSS_HOST_REDIRECT',
    })
  })

  it('rejects a network-path calendar collection before credentials can leave the process', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(calDav({
      runId: 'run-hostile',
      profile: { ...profile, publicConfig: { ...profile.publicConfig, calendarPath: '//evil.example/calendar/' } },
      operation: 'TEST_CONNECTION', payload: {},
    }, credential)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects same-host calendar writes that escape the configured collection root', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(calDav({
      runId: 'run-root-escape',
      profile: { ...profile, publicConfig: { ...profile.publicConfig, syncDirection: 'BIDIRECTIONAL' } },
      operation: 'CALENDAR_SYNC_COMMIT',
      payload: { items: [{ localType: 'CALENDAR_EVENT', remoteId: '/admin/1.ics', ical: 'BEGIN:VCALENDAR\nEND:VCALENDAR' }] },
    }, credential)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
