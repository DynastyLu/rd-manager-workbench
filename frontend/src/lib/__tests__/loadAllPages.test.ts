import { describe, expect, it, vi } from 'vitest'
import { loadAllPages } from '../loadAllPages'

describe('loadAllPages', () => {
  it('loads and merges every API page using the server pagination metadata', async () => {
    const fetchPage = vi.fn(async (page: number, pageSize: number) => ({
      data: page === 1 ? Array.from({ length: 100 }, (_, index) => index) : [100],
      meta: { page, pageSize, total: 101 },
    }))

    const result = await loadAllPages(fetchPage, 100)

    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100)
    expect(result.data).toHaveLength(101)
    expect(result.meta).toEqual({ page: 1, pageSize: 101, total: 101 })
  })

  it('does not issue extra requests when the first page contains the full result', async () => {
    const fetchPage = vi.fn(async (page: number, pageSize: number) => ({
      data: ['only'],
      meta: { page, pageSize, total: 1 },
    }))

    await expect(loadAllPages(fetchPage)).resolves.toMatchObject({ data: ['only'] })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
