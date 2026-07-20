import { describe, expect, it, vi } from 'vitest'
import { responseBytesLimited, responseTextLimited } from './provider-http.js'

describe('bounded provider responses', () => {
  it('stops a streamed response as soon as the byte limit is exceeded without buffering the whole body', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const chunks = [new Uint8Array(6), new Uint8Array(6)]
    const response = {
      headers: new Headers(),
      body: { getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: chunks[0] })
          .mockResolvedValueOnce({ done: false, value: chunks[1] }),
        cancel,
      }) },
      arrayBuffer: vi.fn(() => { throw new Error('must not allocate an unbounded body') }),
    } as unknown as Response

    await expect(responseBytesLimited(response, 10)).rejects.toThrow('EXTENSION_RESPONSE_TOO_LARGE')
    expect(cancel).toHaveBeenCalled()
    expect(response.arrayBuffer).not.toHaveBeenCalled()
  })

  it('rejects an oversized declared content length before reading response text', async () => {
    const response = new Response('small', { headers: { 'content-length': '100' } })
    await expect(responseTextLimited(response, 10)).rejects.toThrow('EXTENSION_RESPONSE_TOO_LARGE')
  })
})
