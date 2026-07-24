import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, download, request } from '@/lib/http'

describe('workbench HTTP client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, '__APP_CONFIG__')
  })

  it('unwraps a successful API envelope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'p1', name: '研发平台' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(request<{ id: string; name: string }>('/projects/p1')).resolves.toEqual({
      id: 'p1',
      name: '研发平台',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4311/api/projects/p1',
      expect.objectContaining({ headers: expect.any(Headers) })
    )
  })

  it('turns a failed API envelope into an ApiError with status and code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'PROJECT_NOT_FOUND', message: '不存在' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(request('/projects/p1')).rejects.toMatchObject<ApiError>({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
      message: '不存在',
    })
  })

  it('turns a failed download envelope into the same structured ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'EMPLOYEE_IMPORT_NOT_FOUND',
            message: '导入批次不存在',
            details: { batchId: 'batch-404' },
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(
      download('/employee-work-imports/batch-404/source')
    ).rejects.toMatchObject<ApiError>({
      status: 404,
      code: 'EMPLOYEE_IMPORT_NOT_FOUND',
      message: '导入批次不存在',
      details: { batchId: 'batch-404' },
    })
  })

  it('wraps a download network failure as NETWORK_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(download('/employee-work-imports/template')).rejects.toMatchObject<ApiError>({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Failed to fetch',
    })
  })

  it('keeps successful download blobs and encoded filenames intact', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('xlsx', {
        status: 200,
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''%E5%91%A8%E6%8A%A5.xlsx",
        },
      })
    )

    const result = await download('/employee-work-imports/template')

    expect(result.fileName).toBe('周报.xlsx')
    await expect(result.blob.text()).resolves.toBe('xlsx')
  })

  it('preserves structured error details such as a formula character position', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'HTTP_ERROR',
            message: 'Unexpected token',
            details: { code: 'INVALID_FORMULA', position: 7 },
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(request('/base/tables/table-1/formula-preview')).rejects.toMatchObject<ApiError>({
      details: { code: 'INVALID_FORMULA', position: 7 },
    })
  })

  it('uses the runtime API base URL embedded in the production config file', async () => {
    vi.resetModules()
    window.__APP_CONFIG__ = {
      apiBaseUrl: 'http://127.0.0.1:4999/runtime-api/',
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { request: runtimeRequest } = await import('@/lib/http')

    await runtimeRequest('/notifications')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4999/runtime-api/notifications',
      expect.any(Object)
    )
  })

  it('lets the browser set the multipart boundary for file uploads', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'file-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const form = new FormData()
    form.append('file', new Blob(['document']), 'note.txt')

    await request('/files', { method: 'POST', body: form })

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = init?.headers as Headers
    expect(headers.has('Content-Type')).toBe(false)
  })
})
