import { describe, it, expect } from 'vitest'
import routes, { routeCategories } from '../routes'

describe('workbench routes', () => {
  it('exposes the local workbench routes in navigation order', () => {
    expect(routes.map((route) => route.path)).toEqual([
      '/',
      '/projects',
      '/tasks',
      '/application-cases',
      '/risks',
      '/issues',
      '/decisions',
      '/partners',
      '/meetings',
      '/settings',
      '*',
    ])
    expect(routeCategories.flatMap((category) => category.routes)).toEqual(routes.slice(0, 10))
    expect(routeCategories[0]?.routes.map((route) => route.title)).toEqual([
      '首页',
      '项目',
      '任务',
      '申报认定',
      '风险',
      '问题',
      '决策',
      '合作方',
      '会议',
      '设置',
    ])
  })

  it('contains no authentication or authorization route metadata', () => {
    routes.forEach((route) => {
      expect(route).not.toHaveProperty('requireAdmin')
      expect(route).not.toHaveProperty('headerOnly')
    })
  })
})
