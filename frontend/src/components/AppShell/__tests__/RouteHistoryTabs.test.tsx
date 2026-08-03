import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RouteHistoryEntry } from '../routeHistory'
import { RouteHistoryTabs } from '../RouteHistoryTabs'
import { selectVisibleHistoryKeys } from '../routeHistory'
import type { RouteHistoryController } from '../useRouteHistory'

const entries: RouteHistoryEntry[] = [
  { key: '/', href: '/', pattern: '/', title: '工作台', pinned: true, visitedAt: 1 },
  { key: '/projects', href: '/spaces/projects', pattern: '/spaces/projects', title: '项目', pinned: false, visitedAt: 2 },
  { key: '/employees', href: '/employees', pattern: '/employees', title: '员工', pinned: false, visitedAt: 3 },
  { key: '/calendar', href: '/calendar', pattern: '/calendar', title: '日历', pinned: false, visitedAt: 4 },
]

function controller(overrides: Partial<RouteHistoryController> = {}): RouteHistoryController {
  return {
    entries,
    activeKey: '/employees',
    open: vi.fn(),
    close: vi.fn(),
    closeOthers: vi.fn(),
    ...overrides,
  }
}

describe('selectVisibleHistoryKeys', () => {
  it('keeps home and the active route while preferring recent entries', () => {
    const visible = selectVisibleHistoryKeys(
      entries,
      '/employees',
      222,
      new Map([
        ['/', 70],
        ['/projects', 70],
        ['/employees', 70],
        ['/calendar', 70],
      ]),
      42,
    )

    expect(visible).toEqual(new Set(['/', '/employees']))
  })

  it('returns all routes when the available width can contain them', () => {
    expect(selectVisibleHistoryKeys(entries, '/employees', 400, new Map(), 42)).toEqual(
      new Set(entries.map((entry) => entry.key)),
    )
  })
})

describe('RouteHistoryTabs', () => {
  it('opens a tab and closes a regular tab without closing home', async () => {
    const user = userEvent.setup()
    const history = controller()
    render(<RouteHistoryTabs controller={history} availableWidth={800} />)

    await user.click(screen.getByRole('tab', { name: '项目' }))
    expect(history.open).toHaveBeenCalledWith('/projects')

    await user.click(screen.getByRole('button', { name: '关闭项目' }))
    expect(history.close).toHaveBeenCalledWith('/projects')
    expect(screen.queryByRole('button', { name: '关闭工作台' })).not.toBeInTheDocument()
  })

  it('moves across visible tabs with arrow keys and supports Delete', async () => {
    const user = userEvent.setup()
    const history = controller()
    render(<RouteHistoryTabs controller={history} availableWidth={800} />)

    const active = screen.getByRole('tab', { name: '员工' })
    active.focus()
    await user.keyboard('{ArrowRight}')
    expect(history.open).toHaveBeenCalledWith('/calendar')

    active.focus()
    await user.keyboard('{Delete}')
    expect(history.close).toHaveBeenCalledWith('/employees')
  })

  it('places hidden routes in a compact overflow menu', async () => {
    const user = userEvent.setup()
    render(<RouteHistoryTabs controller={controller()} availableWidth={222} />)

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '更多历史页面' }))
    expect(await screen.findByText('项目')).toBeInTheDocument()
    expect(screen.getByText('日历')).toBeInTheDocument()
  })
})
