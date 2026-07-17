import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, request } from '@/lib/http'

describe('workbench HTTP client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('unwraps a successful API envelope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: 'p1', name: '研发平台' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(request<{ id: string; name: string }>('/projects/p1')).resolves.toEqual({
      id: 'p1',
      name: '研发平台',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/projects/p1',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('turns a failed API envelope into an ApiError with status and code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'PROJECT_NOT_FOUND', message: '不存在' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(request('/projects/p1')).rejects.toMatchObject<ApiError>({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
      message: '不存在',
    })
  })
})
