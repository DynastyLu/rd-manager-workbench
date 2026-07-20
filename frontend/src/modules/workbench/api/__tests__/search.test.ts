import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/http'

import { runSearchAction, searchWorkbench } from '../search'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, request }
})

const validResult = {
  data: [
    {
      type: 'TASK',
      id: 'task-1',
      title: '完成搜索页面',
      snippet: '实现全局搜索',
      path: '/my-work?taskId=task-1',
      updatedAt: '2026-07-20T01:00:00.000Z',
      score: 210,
      matches: [{ field: 'title', start: 2, end: 4 }],
      actions: ['OPEN', 'COPY_LINK', 'COMPLETE_TASK'],
    },
  ],
  groups: [{ type: 'TASK', count: 1 }],
  meta: { page: 2, pageSize: 10, total: 1 },
  partialFailures: [],
}

describe('global search API client', () => {
  beforeEach(() => request.mockReset())

  it('normalizes and encodes query parameters', async () => {
    request.mockResolvedValue(validResult)

    await searchWorkbench({
      query: '  盐碱 项目  ',
      types: ['PROJECT', 'TASK'],
      page: 2,
      pageSize: 10,
    })

    expect(request).toHaveBeenCalledWith(
      '/search?q=%E7%9B%90%E7%A2%B1+%E9%A1%B9%E7%9B%AE&types=PROJECT%2CTASK&page=2&pageSize=10'
    )
  })

  it('rejects malformed search responses before they reach the page', async () => {
    request.mockResolvedValue({
      ...validResult,
      data: [{ ...validResult.data[0], path: 'https://example.com/phishing' }],
    })

    await expect(searchWorkbench({ query: '搜索' })).rejects.toMatchObject({
      name: 'ApiError',
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each(['//example.com/phishing', '/https://example.com/phishing', '/base\\record'])(
    'rejects unsafe local route %s',
    async (path) => {
      request.mockResolvedValue({
        ...validResult,
        data: [{ ...validResult.data[0], path }],
      })

      await expect(searchWorkbench({ query: '搜索' })).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      })
    }
  )

  it('posts an encoded, allowlisted quick action and validates the returned hit', async () => {
    request.mockResolvedValue(validResult.data[0])

    await expect(runSearchAction('TASK', 'task / 1', { action: 'COMPLETE_TASK' })).resolves.toEqual(
      validResult.data[0]
    )

    expect(request).toHaveBeenCalledWith('/search/actions/TASK/task%20%2F%201', {
      method: 'POST',
      body: JSON.stringify({ action: 'COMPLETE_TASK' }),
    })
  })
})
