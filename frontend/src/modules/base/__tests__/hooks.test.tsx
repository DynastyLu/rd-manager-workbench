import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebouncedViewConfigSave, useInfiniteBaseRecords, useUpdateBaseRecord } from '../hooks'

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
      .mockResolvedValueOnce({ data: [{ id: 'record-1' }], meta: { page: 1, pageSize: 100, total: 101 } })
      .mockResolvedValueOnce({ data: [{ id: 'record-2' }], meta: { page: 2, pageSize: 100, total: 101 } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useInfiniteBaseRecords('table-1', { query: '研发' }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', { query: '研发', page: 1, pageSize: 100 })
    await act(() => result.current.fetchNextPage())
    expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', { query: '研发', page: 2, pageSize: 100 })
  })

  it('invalidates every consumer cache after a system-backed record update', async () => {
    api.updateBaseRecord.mockResolvedValue({ id: 'record-1', values: { title: '已完成' } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useUpdateBaseRecord(), { wrapper })

    act(() => result.current.mutate({ tableId: 'table-tasks', recordId: 'record-1', values: { status: 'DONE' } }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    for (const queryKey of [
      ['base', 'records', 'table-tasks'], ['my-work'], ['tasks'], ['calendar'],
      ['projects'], ['project'], ['task'], ['dashboard'], ['reminders'],
      ['documents'], ['document'], ['document-versions'], ['files'],
      ['meetings'], ['meeting'], ['risks'], ['risk'], ['decisions'], ['decision'],
    ]) expect(invalidate).toHaveBeenCalledWith({ queryKey })
  })

  it('debounces each view independently and flushes only the latest pending config on unmount', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedViewConfigSave(save, 350))

    act(() => {
      result.current('view-a', { query: 'a' })
      result.current('view-b', { query: 'b' })
      vi.advanceTimersByTime(350)
    })
    expect(save).toHaveBeenCalledWith('view-a', { query: 'a' })
    expect(save).toHaveBeenCalledWith('view-b', { query: 'b' })

    act(() => {
      result.current('view-a', { query: 'old' })
      result.current('view-a', { query: 'latest' })
      unmount()
    })
    expect(save).toHaveBeenLastCalledWith('view-a', { query: 'latest' })
    expect(save).toHaveBeenCalledTimes(3)
  })
})
