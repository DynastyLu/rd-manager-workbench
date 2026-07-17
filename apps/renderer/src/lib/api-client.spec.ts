import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from './api-client'

const RUNTIME_CONFIG = {
  apiBaseUrl: 'http://127.0.0.1:43127',
  sessionToken: 'c'.repeat(32),
  appVersion: '0.1.0',
  platform: 'darwin' as const,
}

describe('createApiClient', () => {
  it('sends readiness requests only to loopback with the desktop token header', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { status: 'ready', database: 'ready' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const client = createApiClient(RUNTIME_CONFIG, fetchMock)
    await expect(client.getReadiness()).resolves.toEqual({
      status: 'ready',
      database: 'ready',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:43127/api/health/ready',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-workbench-token': RUNTIME_CONFIG.sessionToken,
        }),
      }),
    )
  })

  it('does not expose backend response bodies in non-success errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('database password=secret', { status: 503 }))
    const client = createApiClient(RUNTIME_CONFIG, fetchMock)

    await expect(client.getReadiness()).rejects.not.toThrow(/password|secret/)
  })
})
