import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Semi workspace foundation', () => {
  it('installs and loads the shared Semi component styles', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      dependencies: Record<string, string>
    }
    const mainSource = readProjectFile('src/main.tsx')

    expect(packageJson.dependencies['@douyinfe/semi-ui']).toBeDefined()
    expect(packageJson.dependencies['@douyinfe/semi-icons']).toBeDefined()
    expect(mainSource).toContain("@douyinfe/semi-ui/lib/es/_base/base.css")
    expect(mainSource).toContain("@/styles/workspace-tokens.css")
  })

  it('defines a stable light workspace token contract', () => {
    const tokenSource = readProjectFile('src/styles/workspace-tokens.css')

    expect(tokenSource).toContain('--workspace-sidebar-width: 208px')
    expect(tokenSource).toContain('--workspace-header-height: 56px')
    expect(tokenSource).toContain('--workspace-brand: #8b5cf6')
    expect(tokenSource).toContain('--workspace-canvas: #f8fafc')
  })
})
