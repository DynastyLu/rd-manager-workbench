import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '@/constants/routes'
import routes, { findRoute, primaryNavigation } from '../routes'

function LocationProbe() {
  const location = useLocation()
  const navigationType = useNavigationType()

  return createElement('output', undefined, `${location.pathname}:${navigationType}`)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('workspace route registry', () => {
  it('exposes the seven core apps in product order', () => {
    expect(primaryNavigation.map((item) => item.title)).toEqual([
      '工作台',
      '我的工作',
      '项目',
      '文档与知识库',
      '多维表格',
      '日历',
      '搜索',
    ])
    expect(primaryNavigation.map((item) => item.path)).toEqual([
      ROUTES.HOME,
      ROUTES.MY_WORK,
      ROUTES.PROJECT_SPACES,
      ROUTES.DOCS,
      ROUTES.BASE,
      ROUTES.CALENDAR,
      ROUTES.SEARCH,
    ])
  })

  it('registers every core app at its canonical path and title', () => {
    expect(primaryNavigation.map((item) => findRoute(item.path)?.title)).toEqual([
      '工作台',
      '我的工作',
      '项目',
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

  it('keeps former workspace entry URLs available outside primary navigation', () => {
    const formerEntryPaths = [
      ROUTES.LIBRARY,
      ROUTES.MEETINGS,
      ROUTES.KNOWLEDGE,
      ROUTES.AUTOMATION_DATA,
      ROUTES.SETTINGS,
    ]

    expect(formerEntryPaths.every((path) => findRoute(path))).toBe(true)
    expect(primaryNavigation.map((item) => item.path)).not.toEqual(
      expect.arrayContaining(formerEntryPaths)
    )
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

  it('keeps the documents app available while its dedicated experience evolves', () => {
    expect(findRoute(ROUTES.DOCS)?.availability).toBe('AVAILABLE')
    expect(findRoute(ROUTES.DOCS)?.component).toBeDefined()
  })

  it('renders the existing knowledge directory at the canonical documents path', () => {
    const documentsRoute = findRoute(ROUTES.DOCS)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(
      createElement(
        MemoryRouter,
        { initialEntries: [ROUTES.DOCS] },
        createElement(
          Routes,
          undefined,
          createElement(Route, {
            path: ROUTES.DOCS,
            element: documentsRoute ? createElement(documentsRoute.component) : null,
          })
        )
      )
    )

    expect(screen.getByRole('heading', { name: '知识库' })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
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
})
