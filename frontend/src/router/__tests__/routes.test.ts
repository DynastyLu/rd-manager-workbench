import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '@/constants/routes'
import { findRoute, primaryNavigation } from '../routes'

function LocationProbe() {
  const location = useLocation()
  const navigationType = useNavigationType()

  return createElement(
    'output',
    undefined,
    `${location.pathname}${location.search}:${navigationType}`
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('workspace route registry', () => {
  it('exposes the eight core apps in product order', () => {
    expect(primaryNavigation.map((item) => item.title)).toEqual([
      '工作台',
      '我的工作',
      '项目',
      '员工',
      '文档与知识库',
      '多维表格',
      '日历',
      '搜索',
    ])
    expect(primaryNavigation.map((item) => item.path)).toEqual([
      ROUTES.HOME,
      ROUTES.MY_WORK,
      ROUTES.PROJECT_SPACES,
      ROUTES.EMPLOYEES,
      ROUTES.DOCS,
      ROUTES.BASE,
      ROUTES.CALENDAR,
      ROUTES.SEARCH,
    ])
    expect(primaryNavigation.every((item) => !('availability' in item))).toBe(true)
  })

  it('registers every core app at its canonical path and title', () => {
    expect(primaryNavigation.map((item) => findRoute(item.path)?.title)).toEqual([
      '工作台',
      '我的工作',
      '项目',
      '员工',
      '文档与知识库',
      '多维表格',
      '日历',
      '搜索',
    ])
    expect([ROUTES.DOCS, ROUTES.BASE, ROUTES.CALENDAR, ROUTES.SEARCH]).toEqual([
      '/docs',
      '/base',
      '/calendar',
      '/search',
    ])
  })

  it('keeps legacy URLs as replace redirects to their canonical destinations', () => {
    expect(findRoute('/projects')?.redirectTo).toBe('/spaces/projects')
    expect(findRoute('/tasks')?.redirectTo).toBe('/my-work')
    expect(findRoute('/application-cases')?.redirectTo).toBe('/library/applications')
    expect(findRoute('/risks')?.redirectTo).toBe('/library/governance/risks')
    expect(findRoute('/issues')?.redirectTo).toBe('/library/governance/issues')
    expect(findRoute('/decisions')?.redirectTo).toBe('/library/governance/decisions')
    expect(findRoute('/partners')?.redirectTo).toBe('/library/governance/partners')
  })

  it('redirects former workspace entries while keeping settings directly reachable', () => {
    expect(findRoute(ROUTES.LIBRARY)?.redirectTo).toBe(ROUTES.BASE)
    expect(findRoute(ROUTES.MEETINGS)?.redirectTo).toBe(ROUTES.CALENDAR)
    expect(findRoute(ROUTES.KNOWLEDGE)?.redirectTo).toBe(ROUTES.DOCS)
    expect(findRoute(ROUTES.AUTOMATION_DATA)?.redirectTo).toBe(ROUTES.SEARCH)
    expect(findRoute(ROUTES.SETTINGS)?.redirectTo).toBeUndefined()
    expect(findRoute(ROUTES.SETTINGS)?.component).toBeDefined()
    expect(primaryNavigation.map((item) => item.path)).not.toContain(ROUTES.SETTINGS)
  })

  it('replaces a legacy URL at runtime with its canonical location', async () => {
    const legacyRoute = findRoute('/projects')

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/projects'] },
        createElement(Routes, undefined, [
          createElement(Route, {
            key: 'legacy-projects',
            path: '/projects',
            element: legacyRoute ? createElement(legacyRoute.component) : null,
          }),
          createElement(Route, {
            key: 'project-spaces',
            path: '/spaces/projects',
            element: createElement(LocationProbe),
          }),
        ])
      )
    )

    expect(await screen.findByText('/spaces/projects:REPLACE')).toBeInTheDocument()
  })

  it('preserves query state while redirecting a legacy workspace URL', async () => {
    const legacyRoute = findRoute(ROUTES.KNOWLEDGE)

    render(
      createElement(
        MemoryRouter,
        { initialEntries: [`${ROUTES.KNOWLEDGE}?directory=favorites&query=材料`] },
        createElement(Routes, undefined, [
          createElement(Route, {
            key: 'legacy-knowledge',
            path: ROUTES.KNOWLEDGE,
            element: legacyRoute ? createElement(legacyRoute.component) : null,
          }),
          createElement(Route, {
            key: 'documents',
            path: ROUTES.DOCS,
            element: createElement(LocationProbe),
          }),
        ])
      )
    )

    expect(
      await screen.findByText('/docs?directory=favorites&query=%E6%9D%90%E6%96%99:REPLACE')
    ).toBeInTheDocument()
  })

  it('keeps the real documents app available at its canonical route', () => {
    expect(findRoute(ROUTES.DOCS)?.availability).toBe('AVAILABLE')
    expect(findRoute(ROUTES.DOCS)?.component).toBeDefined()
    expect(findRoute(ROUTES.DOCS)?.redirectTo).toBeUndefined()
  })

  it('uses the shared planned state for an unknown governance module', () => {
    const governanceRoute = findRoute('/library/governance/:kind')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/library/governance/unknown'] },
        createElement(
          Routes,
          undefined,
          createElement(Route, {
            path: '/library/governance/:kind',
            element: governanceRoute ? createElement(governanceRoute.component) : null,
          })
        )
      )
    )

    expect(screen.getByRole('heading', { name: '业务库' })).toBeInTheDocument()
    expect(screen.getByText('该能力正在规划中')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('builds project workspace and governance paths safely', () => {
    expect(ROUTES.projectWorkspace('项目 / A')).toBe(
      '/spaces/projects/%E9%A1%B9%E7%9B%AE%20%2F%20A/overview'
    )
    expect(ROUTES.projectWorkspace('project-1', 'tasks')).toBe('/spaces/projects/project-1/tasks')
    expect(ROUTES.governance('risks')).toBe('/library/governance/risks')
  })

  it('builds encoded employee detail paths and registers both employee routes', () => {
    expect(ROUTES.employeeDetail('员工 / A')).toBe('/employees/%E5%91%98%E5%B7%A5%20%2F%20A')
    expect(findRoute(ROUTES.EMPLOYEES)?.title).toBe('员工')
    expect(findRoute('/employees/:employeeId')?.navigationKey).toBe('employees')
  })
})
