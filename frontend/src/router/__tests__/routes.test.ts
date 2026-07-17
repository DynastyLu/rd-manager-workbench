import { describe, it, expect } from 'vitest'
import routes, { routeCategories } from '../routes'

describe('workbench routes', () => {
  it('exposes only the local workbench and settings routes', () => {
    expect(routes.map((route) => route.path)).toEqual(['/', '/settings', '*'])
    expect(routeCategories.flatMap((category) => category.routes)).toEqual(routes.slice(0, 2))
  })

  it('contains no authentication or authorization route metadata', () => {
    routes.forEach((route) => {
      expect(route).not.toHaveProperty('requireAdmin')
      expect(route).not.toHaveProperty('headerOnly')
    })
  })
})
