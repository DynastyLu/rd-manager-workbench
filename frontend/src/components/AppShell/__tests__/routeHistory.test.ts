import { describe, expect, it } from 'vitest'
import {
  closeHistoryEntry,
  closeOtherHistoryEntries,
  createHistoryEntry,
  normalizeRouteKey,
  parseStoredHistory,
  sanitizeHistoryHref,
  visitHistoryEntry,
} from '../routeHistory'

describe('routeHistory', () => {
  it('updates the last href without duplicating query-only navigation', () => {
    const home = createHistoryEntry('/', '/', '/', '工作台', true, 1)
    const first = visitHistoryEntry([home], {
      pathname: '/employees',
      href: '/employees?tab=directory',
      pattern: '/employees',
      title: '员工',
      visitedAt: 2,
    })
    const second = visitHistoryEntry(first, {
      pathname: '/employees',
      href: '/employees?tab=imports',
      pattern: '/employees',
      title: '员工',
      visitedAt: 3,
    })

    expect(second).toHaveLength(2)
    expect(second[1]).toMatchObject({ key: '/employees', href: '/employees?tab=imports' })
  })

  it('keeps different project ids but folds project sections into one key', () => {
    const first = visitHistoryEntry([], {
      pathname: '/spaces/projects/p-1/overview',
      href: '/spaces/projects/p-1/overview',
      pattern: '/spaces/projects/:projectId/:section?',
      title: '项目详情',
      visitedAt: 1,
    })
    const second = visitHistoryEntry(first, {
      pathname: '/spaces/projects/p-1/risks',
      href: '/spaces/projects/p-1/risks',
      pattern: '/spaces/projects/:projectId/:section?',
      title: '项目详情',
      visitedAt: 2,
    })
    const third = visitHistoryEntry(second, {
      pathname: '/spaces/projects/p-2/overview',
      href: '/spaces/projects/p-2/overview',
      pattern: '/spaces/projects/:projectId/:section?',
      title: '项目详情',
      visitedAt: 3,
    })

    expect(third.map((entry) => entry.key)).toEqual([
      '/spaces/projects/p-1',
      '/spaces/projects/p-2',
    ])
    expect(third[0]?.href).toBe('/spaces/projects/p-1/risks')
  })

  it('keeps employee ids distinct and normalizes trailing slashes', () => {
    expect(normalizeRouteKey('/employees/e-1/', '/employees/:employeeId')).toBe(
      '/employees/e-1',
    )
    expect(normalizeRouteKey('/calendar/', '/calendar')).toBe('/calendar')
  })

  it('selects the left neighbor when closing the active entry', () => {
    const entries = [
      createHistoryEntry('/', '/', '/', '工作台', true, 1),
      createHistoryEntry('/employees', '/employees', '/employees', '员工', false, 2),
      createHistoryEntry('/calendar', '/calendar', '/calendar', '日历', false, 3),
    ]

    expect(closeHistoryEntry(entries, '/calendar', '/calendar')).toEqual({
      entries: entries.slice(0, 2),
      nextHref: '/employees',
    })
  })

  it('never closes the pinned home entry and can close all other entries', () => {
    const entries = [
      createHistoryEntry('/', '/', '/', '工作台', true, 1),
      createHistoryEntry('/employees', '/employees', '/employees', '员工', false, 2),
      createHistoryEntry('/calendar', '/calendar', '/calendar', '日历', false, 3),
    ]

    expect(closeHistoryEntry(entries, '/', '/employees')).toEqual({ entries })
    expect(closeOtherHistoryEntries(entries, '/calendar').map((entry) => entry.key)).toEqual([
      '/',
      '/calendar',
    ])
  })

  it('rejects corrupt storage and strips secret parameters', () => {
    expect(parseStoredHistory('{bad-json')).toEqual([])
    expect(sanitizeHistoryHref('/search?q=项目&token=secret&PASSWORD=hidden#results')).toBe(
      '/search?q=%E9%A1%B9%E7%9B%AE#results',
    )
  })

  it('evicts the least recently visited regular entry when the limit is exceeded', () => {
    const home = createHistoryEntry('/', '/', '/', '工作台', true, 1)
    const entries = Array.from({ length: 20 }, (_, index) =>
      createHistoryEntry(
        `/page-${index}`,
        `/page-${index}`,
        `/page-${index}`,
        `页面 ${index}`,
        false,
        index + 2,
      ),
    )
    const next = visitHistoryEntry([home, ...entries], {
      pathname: '/new-page',
      href: '/new-page',
      pattern: '/new-page',
      title: '新页面',
      visitedAt: 100,
    })

    expect(next).toHaveLength(21)
    expect(next.some((entry) => entry.key === '/page-0')).toBe(false)
    expect(next.some((entry) => entry.key === '/new-page')).toBe(true)
  })
})
