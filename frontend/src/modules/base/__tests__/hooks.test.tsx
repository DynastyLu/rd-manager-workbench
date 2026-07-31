import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useAllBaseRecords,
  useDebouncedViewConfigSave,
  useInfiniteBaseRecords,
  useSelectedBaseRecords,
  useUpdateBaseRecord,
} from '../hooks'

const api = vi.hoisted(() => ({ listBaseRecords: vi.fn(), updateBaseRecord: vi.fn() }))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  updateBaseRecord: api.updateBaseRecord,
  listBaseRecords: api.listBaseRecords,
}))

describe('base hooks', () => {
  beforeEach(() => {
    api.updateBaseRecord.mockReset()
    api.listBaseRecords.mockReset()
    vi.useRealTimers()
  })

  it('paginates server-side relation searches with a fixed page size', async () => {
    api.listBaseRecords
      .mockResolvedValueOnce({
        data: [{ id: 'record-1' }],
        meta: { page: 1, pageSize: 100, total: 101 },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'record-2' }],
        meta: { page: 2, pageSize: 100, total: 101 },
      })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useInfiniteBaseRecords('table-1', { query: '研发' }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', {
      query: '研发',
      page: 1,
      pageSize: 100,
    })
    await act(() => result.current.fetchNextPage())
    expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', {
      query: '研发',
      page: 2,
      pageSize: 100,
    })
  })

  it('automatically aggregates every advanced-view page without truncating meta.total', async () => {
    api.listBaseRecords.mockImplementation((_tableId: string, query: { page: number }) =>
      Promise.resolve({
        data: Array.from({ length: query.page === 3 ? 5 : 100 }, (_, index) => ({
          id: `record-${(query.page - 1) * 100 + index + 1}`,
          values: {},
        })),
        meta: { page: query.page, pageSize: 100, total: 205 },
      })
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => useAllBaseRecords('table-1', { viewId: 'gantt-view' }, true),
      { wrapper }
    )

    await waitFor(() => expect(result.current.data?.data).toHaveLength(205))
    expect(api.listBaseRecords).toHaveBeenCalledTimes(3)
    expect(api.listBaseRecords.mock.calls.map((call) => call[1].page)).toEqual([1, 2, 3])
    expect(result.current.data?.meta.total).toBe(205)
  })

  it('stops after a failed advanced page and resumes aggregation after a manual refetch', async () => {
    const pageError = new Error('page 2 failed')
    let pageTwoAttempts = 0
    let canRecover = false
    api.listBaseRecords.mockImplementation((_tableId: string, query: { page: number }) => {
      if (query.page === 1) {
        return Promise.resolve({
          data: Array.from({ length: 100 }, (_, index) => ({
            id: `record-${index + 1}`,
            values: {},
          })),
          meta: { page: 1, pageSize: 100, total: 101 },
        })
      }
      pageTwoAttempts += 1
      if (canRecover) {
        return Promise.resolve({
          data: [{ id: 'record-101', values: {} }],
          meta: { page: 2, pageSize: 100, total: 101 },
        })
      }
      if (pageTwoAttempts === 1) return Promise.reject(pageError)
      return new Promise(() => undefined)
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => useAllBaseRecords('table-1', { viewId: 'gantt-view' }, true),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true))
    expect(pageTwoAttempts).toBe(1)
    expect(result.current.error).toBe(pageError)

    canRecover = true
    await act(() => result.current.refetch())

    await waitFor(() => expect(result.current.data?.data).toHaveLength(101))
    expect(pageTwoAttempts).toBe(2)
    expect(result.current.isError).toBe(false)
  })

  it('does not request advanced pages while the advanced-view hook is disabled', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(() => useAllBaseRecords('table-1', { viewId: 'grid-view' }, false), { wrapper })

    expect(api.listBaseRecords).not.toHaveBeenCalled()
  })

  it('fetches selected relation ids in exact batches of 100', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `record-${index + 1}`)
    api.listBaseRecords.mockImplementation((_tableId: string, query: { recordIds: string[] }) =>
      Promise.resolve({
        data: query.recordIds.map((id) => ({ id, values: {} })),
        meta: { page: 1, pageSize: 100, total: query.recordIds.length },
      })
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useSelectedBaseRecords('table-1', ids), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listBaseRecords).toHaveBeenCalledTimes(2)
    expect(api.listBaseRecords.mock.calls[0]?.[1].recordIds).toEqual(ids.slice(0, 100))
    expect(api.listBaseRecords.mock.calls[1]?.[1].recordIds).toEqual(ids.slice(100))
    expect(result.current.data?.data.map((record) => record.id)).toEqual(ids)
  })

  it('invalidates every consumer cache after a system-backed record update', async () => {
    api.updateBaseRecord.mockResolvedValue({ id: 'record-1', values: { title: '已完成' } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateBaseRecord(), { wrapper })

    act(() =>
      result.current.mutate({
        tableId: 'table-tasks',
        recordId: 'record-1',
        values: { status: 'DONE' },
      })
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    for (const queryKey of [
      ['base', 'records', 'table-tasks'],
      ['my-work'],
      ['tasks'],
      ['calendar'],
      ['projects'],
      ['project'],
      ['task'],
      ['dashboard'],
      ['reminders'],
      ['documents'],
      ['document'],
      ['document-versions'],
      ['files'],
      ['meetings'],
      ['meeting'],
      ['risks'],
      ['risk'],
      ['decisions'],
      ['decision'],
    ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey })
  })

  it('debounces each view independently and flushes only the latest pending config on unmount', async () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedViewConfigSave(save, 350))

    await act(async () => {
      result.current.schedule('view-a', { query: 'a' })
      result.current.schedule('view-b', { query: 'b' })
      await vi.advanceTimersByTimeAsync(350)
    })
    expect(save).toHaveBeenCalledWith(
      'view-a',
      { query: 'a' },
      expect.objectContaining({ revision: 1, isLatest: expect.any(Function) }),
    )
    expect(save).toHaveBeenCalledWith(
      'view-b',
      { query: 'b' },
      expect.objectContaining({ revision: 1, isLatest: expect.any(Function) }),
    )

    await act(async () => {
      result.current.schedule('view-a', { query: 'old' })
      result.current.schedule('view-a', { query: 'latest' })
      unmount()
      await Promise.resolve()
    })
    expect(save).toHaveBeenLastCalledWith(
      'view-a',
      { query: 'latest' },
      expect.objectContaining({ revision: 3, isLatest: expect.any(Function) }),
    )
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('cancels the pending save for one deleted view without affecting another view', async () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const { result } = renderHook(() => useDebouncedViewConfigSave(save, 350))

    await act(async () => {
      result.current.schedule('view-a', { query: 'deleted' })
      result.current.schedule('view-b', { query: 'kept' })
      result.current.cancel('view-a')
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(save.mock.calls.some(([viewId]) => viewId === 'view-a')).toBe(false)
    expect(save).toHaveBeenCalledWith(
      'view-b',
      { query: 'kept' },
      expect.objectContaining({ revision: 1, isLatest: expect.any(Function) }),
    )
  })
})
