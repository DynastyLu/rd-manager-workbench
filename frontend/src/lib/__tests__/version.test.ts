import { afterEach, describe, expect, it, vi } from 'vitest'

describe('checkForUpdate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('fetches version metadata relative to the Vite base URL', async () => {
    vi.stubEnv('BASE_URL', './')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: '0.0.0', buildTime: '2026-07-18T00:00:00.000Z' }), {
        status: 200,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { checkForUpdate } = await import('../version')
    await checkForUpdate()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\.\/version\.json\?t=\d+$/))
  })
})
