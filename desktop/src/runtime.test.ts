import { describe, expect, it } from 'vitest'
import { normalizeSourcePath, resolveBackendEntry, resolveRendererTarget } from './runtime.js'

describe('desktop runtime paths', () => {
  it('uses isolated development ports without starting a second backend', () => {
    const input = { isPackaged: false, resourcesPath: '/resources', projectRoot: '/repo' }
    expect(resolveRendererTarget(input)).toEqual({ kind: 'url', value: 'http://127.0.0.1:4312' })
    expect(resolveBackendEntry(input)).toBeNull()
  })

  it('loads packaged resources and accepts explicit overrides', () => {
    expect(resolveRendererTarget({
      isPackaged: true,
      resourcesPath: '/Applications/Workbench/resources',
      projectRoot: '/repo',
    })).toEqual({
      kind: 'file',
      value: '/Applications/Workbench/resources/frontend/index.html',
    })
    expect(resolveBackendEntry({
      isPackaged: true,
      resourcesPath: '/Applications/Workbench/resources',
      projectRoot: '/repo',
    })).toBe('/Applications/Workbench/resources/backend/dist/src/main.js')
  })

  it('only accepts internal source paths for notification navigation', () => {
    expect(normalizeSourcePath('/my-work?view=TODAY')).toBe('/my-work?view=TODAY')
    expect(normalizeSourcePath('https://example.com')).toBe('/')
    expect(normalizeSourcePath('//example.com')).toBe('/')
  })
})
