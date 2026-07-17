import { describe, it, expect } from 'vitest'
import routes from '../routes'

describe('routes', () => {
  it('exports a non-empty array of routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(7)
  })

  it('each route has path and title', () => {
    routes.forEach((r) => {
      expect(r).toHaveProperty('path')
      expect(r).toHaveProperty('title')
      expect(r).toHaveProperty('component')
    })
  })

  it('includes required paths', () => {
    const paths = routes.map((r) => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/ocr')
    expect(paths).toContain('/hairstyle')
    expect(paths).toContain('/copyright-risk')
    expect(paths).toContain('/history')
    expect(paths).toContain('/settings')
    expect(paths).toContain('/profile')
    expect(paths).toContain('/mine')
    expect(paths).toContain('/admin')
  })
})
