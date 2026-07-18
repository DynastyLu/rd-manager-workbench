import { describe, expect, it } from 'vitest'
import { loadConfigFromFile } from 'vite'

async function loadWorkbenchViteConfig() {
  const loadedConfig = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    undefined,
    process.cwd()
  )

  if (!loadedConfig) {
    throw new Error('Unable to load the workbench Vite configuration.')
  }

  return loadedConfig.config
}

describe('workbench Vite configuration', () => {
  it('uses the isolated loopback development port without fallback', async () => {
    const config = await loadWorkbenchViteConfig()

    expect(config.server).toMatchObject({
      host: '127.0.0.1',
      port: 4300,
      strictPort: true,
    })
  })

  it('uses the isolated loopback preview port without fallback', async () => {
    const config = await loadWorkbenchViteConfig()

    expect(config.preview).toMatchObject({
      host: '127.0.0.1',
      port: 4300,
      strictPort: true,
    })
  })
})
