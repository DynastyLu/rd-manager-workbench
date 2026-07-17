import { describe, expect, it, vi } from 'vitest'

import { getRuntimeConfig } from './runtime'

const VALID_RUNTIME = {
  apiBaseUrl: 'http://127.0.0.1:43127',
  sessionToken: 'b'.repeat(32),
  appVersion: '0.1.0',
  platform: 'darwin' as const,
}

describe('getRuntimeConfig', () => {
  it('reads and validates the preload runtime contract', async () => {
    Object.defineProperty(window, 'workbench', {
      configurable: true,
      value: { getRuntimeConfig: vi.fn().mockResolvedValue(VALID_RUNTIME) },
    })

    await expect(getRuntimeConfig()).resolves.toEqual(VALID_RUNTIME)
  })

  it.each([
    { ...VALID_RUNTIME, apiBaseUrl: 'http://localhost:43127' },
    { ...VALID_RUNTIME, apiBaseUrl: 'http://127.0.0.1:80' },
    { ...VALID_RUNTIME, openShell: true },
  ])('rejects non-loopback, privileged, or expanded runtime capabilities', async (runtime) => {
    Object.defineProperty(window, 'workbench', {
      configurable: true,
      value: { getRuntimeConfig: vi.fn().mockResolvedValue(runtime) },
    })

    await expect(getRuntimeConfig()).rejects.toThrow('运行时配置校验失败')
  })

  it('rejects a preload bridge that exposes capabilities beyond runtime reading', async () => {
    Object.defineProperty(window, 'workbench', {
      configurable: true,
      value: {
        getRuntimeConfig: vi.fn().mockResolvedValue(VALID_RUNTIME),
        openShell: vi.fn(),
      },
    })

    await expect(getRuntimeConfig()).rejects.toThrow('桌面运行时接口校验失败')
  })
})
