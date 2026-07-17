import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type WindowWithConfig = Window & {
  __APP_CONFIG__?: {
    apiBaseUrl: string
    wsUrl: string
    sentryDsn: string
    features: { ocrBatchUpload: boolean; adminPanel: boolean }
  }
}

describe('request runtime config', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
    ;(window as WindowWithConfig).__APP_CONFIG__ = {
      apiBaseUrl: 'https://api.runtime.example.com',
      wsUrl: 'wss://api.runtime.example.com',
      sentryDsn: '',
      features: { ocrBatchUpload: true, adminPanel: true },
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete (window as WindowWithConfig).__APP_CONFIG__
    vi.restoreAllMocks()
  })

  it('resolves root-relative API paths against runtime apiBaseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchMock

    const request = await import('../request')
    await request.get('/api/health')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.runtime.example.com/api/health',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('keeps absolute URLs unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchMock

    const request = await import('../request')
    await request.get('https://files.example.com/download.json')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://files.example.com/download.json',
      expect.objectContaining({ method: 'GET' })
    )
  })
})
