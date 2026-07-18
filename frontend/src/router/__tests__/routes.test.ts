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
  it('exposes the eight top-level workspace entries in product order', () => {
    expect(primaryNavigation.map((item) => item.title)).toEqual([
      '工作台',
      '我的工作',
      '项目空间',
      '业务库',
      '会议与资料',
      '知识库',
      '自动化与数据',
      '设置',
    ])
    expect(primaryNavigation.map((item) => item.path)).toEqual([
      ROUTES.HOME,
      ROUTES.MY_WORK,
      ROUTES.PROJECT_SPACES,
      ROUTES.LIBRARY,
      ROUTES.MEETINGS,
      ROUTES.KNOWLEDGE,
      ROUTES.AUTOMATION_DATA,
      ROUTES.SETTINGS,
    ])
  })

  it('registers every canonical workspace route', () => {
    expect(routes.filter((route) => !route.redirectTo).map((route) => route.path)).toEqual([
      '/',
      '/my-work',
      '/spaces/projects',
      '/spaces/projects/:projectId/:section?',
      '/library',
      '/library/applications',
      '/library/governance/:kind',
      '/meetings',
      '/knowledge',
      '/automation-data',
      '/settings',
      '*',
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

  it('marks knowledge as planned without treating it as an unavailable route', () => {
    expect(findRoute('/knowledge')?.availability).toBe('PLANNED')
    expect(findRoute('/knowledge')?.component).toBeDefined()
  })

  it('renders the planned knowledge route without requesting an API', () => {
    const knowledgeRoute = findRoute(ROUTES.KNOWLEDGE)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(
      createElement(
        MemoryRouter,
        { initialEntries: [ROUTES.KNOWLEDGE] },
        createElement(
          Routes,
          undefined,
          createElement(Route, {
            path: ROUTES.KNOWLEDGE,
            element: knowledgeRoute ? createElement(knowledgeRoute.component) : null,
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
