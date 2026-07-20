import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RECENT_SEARCHES_STORAGE_KEY,
  clearRecentSearches,
  loadRecentSearches,
  recordRecentSearch,
  removeRecentSearch,
} from '../recentSearches'

describe('recent search history', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T08:00:00.000Z'))
  })

  it('falls back to an empty list when persisted JSON is corrupt', () => {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, '{not-json')

    expect(loadRecentSearches()).toEqual([])
  })

  it('does not break search when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(loadRecentSearches()).toEqual([])
    expect(() => recordRecentSearch({ query: '项目进度', types: ['PROJECT'] })).not.toThrow()
    expect(() => clearRecentSearches()).not.toThrow()
  })

  it('normalizes query and types when updating an existing combination', () => {
    recordRecentSearch({ query: '  项目   进度 ', types: ['TASK', 'PROJECT', 'TASK'] })
    vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'))
    recordRecentSearch({ query: '项目 进度', types: ['PROJECT', 'TASK'] })

    expect(loadRecentSearches()).toEqual([
      {
        query: '项目 进度',
        types: ['PROJECT', 'TASK'],
        lastUsedAt: '2026-07-20T09:00:00.000Z',
        useCount: 2,
      },
    ])
  })

  it('keeps only the twenty most recently used searches', () => {
    for (let index = 0; index < 21; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 6, 20, 8, index)))
      recordRecentSearch({ query: `搜索 ${index}`, types: [] })
    }

    const recent = loadRecentSearches()
    expect(recent).toHaveLength(20)
    expect(recent[0]?.query).toBe('搜索 20')
    expect(recent.at(-1)?.query).toBe('搜索 1')
  })

  it('removes one normalized query/type combination and can clear all history', () => {
    recordRecentSearch({ query: '项目进度', types: ['PROJECT'] })
    recordRecentSearch({ query: '项目进度', types: ['TASK'] })

    removeRecentSearch({ query: ' 项目进度 ', types: ['PROJECT'] })
    expect(loadRecentSearches().map((item) => item.types)).toEqual([['TASK']])

    clearRecentSearches()
    expect(loadRecentSearches()).toEqual([])
    expect(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull()
  })
})
