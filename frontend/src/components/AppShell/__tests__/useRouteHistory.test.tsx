import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RouteDefinition } from '@/router/routes'
import { useRouteHistory } from '../useRouteHistory'

const route = (path: string, title: string): RouteDefinition => ({
  path,
  title,
  icon: 'test',
  component: () => null,
  availability: 'AVAILABLE',
})

function Harness({
  userId,
  routeDefinition,
}: {
  userId?: string
  routeDefinition?: RouteDefinition
}) {
  const location = useLocation()
  const history = useRouteHistory({
    userId,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    route: routeDefinition,
  })

  return (
    <div>
      <output aria-label="location">{`${location.pathname}${location.search}`}</output>
      <ol>
        {history.entries.map((entry) => (
          <li key={entry.key}>{`${entry.title}|${entry.href}`}</li>
        ))}
      </ol>
      <button type="button" onClick={() => history.close(history.activeKey)}>
        close active
      </button>
    </div>
  )
}

describe('useRouteHistory', () => {
  beforeEach(() => localStorage.clear())

  it('persists history under the authenticated user id', async () => {
    render(
      <MemoryRouter initialEntries={['/employees?tab=directory']}>
        <Harness userId="user-a" routeDefinition={route('/employees', '员工')} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const saved = localStorage.getItem('rd-workbench:route-history:v1:user-a')
      expect(saved).toContain('/employees?tab=directory')
    })
    expect(screen.getByText('工作台|/')).toBeInTheDocument()
    expect(screen.getByText('员工|/employees?tab=directory')).toBeInTheDocument()
  })

  it('updates an existing entry when only the query changes', async () => {
    const view = render(
      <MemoryRouter initialEntries={['/employees?tab=directory']}>
        <Harness userId="user-a" routeDefinition={route('/employees', '员工')} />
      </MemoryRouter>,
    )

    await screen.findByText('员工|/employees?tab=directory')
    view.unmount()

    render(
      <MemoryRouter initialEntries={['/employees?tab=imports']}>
        <Harness userId="user-a" routeDefinition={route('/employees', '员工')} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('员工|/employees?tab=imports')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('does not restore another users history after account switch', async () => {
    localStorage.setItem(
      'rd-workbench:route-history:v1:user-a',
      JSON.stringify([
        {
          key: '/employees',
          href: '/employees',
          pattern: '/employees',
          title: '员工',
          pinned: false,
          visitedAt: 2,
        },
      ]),
    )

    const view = render(
      <MemoryRouter initialEntries={['/']}>
        <Harness userId="user-a" routeDefinition={route('/', '工作台')} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('员工|/employees')).toBeInTheDocument()

    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <Harness userId="user-b" routeDefinition={route('/', '工作台')} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText('员工|/employees')).not.toBeInTheDocument())
    expect(screen.getByText('工作台|/')).toBeInTheDocument()
  })

  it('navigates to the left neighbor after closing the active route', async () => {
    localStorage.setItem(
      'rd-workbench:route-history:v1:user-a',
      JSON.stringify([
        {
          key: '/',
          href: '/',
          pattern: '/',
          title: '工作台',
          pinned: true,
          visitedAt: 1,
        },
        {
          key: '/employees',
          href: '/employees',
          pattern: '/employees',
          title: '员工',
          pinned: false,
          visitedAt: 2,
        },
      ]),
    )
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/calendar']}>
        <Harness userId="user-a" routeDefinition={route('/calendar', '日历')} />
      </MemoryRouter>,
    )

    await screen.findByText('日历|/calendar')
    await user.click(screen.getByRole('button', { name: 'close active' }))

    await waitFor(() => expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/employees'))
  })

  it('does not store protected history when no user is authenticated', async () => {
    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Harness routeDefinition={route('/employees', '员工')} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.queryByText('员工|/employees')).not.toBeInTheDocument()
    expect(Object.keys(localStorage).filter((key) => key.includes('route-history'))).toEqual([])
  })
})
