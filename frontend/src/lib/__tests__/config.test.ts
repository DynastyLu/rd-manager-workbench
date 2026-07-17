import { describe, it, expect, beforeEach, vi } from 'vitest'

type WindowWithConfig = Window & {
  __APP_CONFIG__?: {
    apiBaseUrl: string
    wsUrl: string
    sentryDsn: string
    features: { ocrBatchUpload: boolean; adminPanel: boolean }
  }
}

describe('config module', () => {
  beforeEach(() => {
    vi.resetModules()
    // 每个测试前清除 window.__APP_CONFIG__，确保隔离
    delete (window as WindowWithConfig).__APP_CONFIG__
  })

  it('falls back to default values when window.__APP_CONFIG__ is absent', async () => {
    const { config } = await import('../config')
    expect(config.apiBaseUrl).toBe('http://localhost:3000')
    expect(config).toHaveProperty('wsUrl')
    expect(config).toHaveProperty('features')
    expect(config.features).toHaveProperty('ocrBatchUpload')
  })

  it('uses window.__APP_CONFIG__ values when present', async () => {
    // 模拟运维修改了 public/config.js 的效果
    ;(window as WindowWithConfig).__APP_CONFIG__ = {
      apiBaseUrl: 'https://runtime.example.com',
      wsUrl: 'wss://runtime.example.com',
      sentryDsn: 'test-dsn',
      features: { ocrBatchUpload: false, adminPanel: false },
    }
    const { config } = await import('../config')
    expect(config.apiBaseUrl).toBe('https://runtime.example.com')
    expect(config.features.ocrBatchUpload).toBe(false)
    expect(config.features.adminPanel).toBe(false)
  })

  it('config object is frozen — mutations throw in strict mode', async () => {
    'use strict'
    const { config } = await import('../config')
    expect(() => {
      // @ts-expect-error — 测试运行时 freeze 行为
      config.apiBaseUrl = 'http://evil.com'
    }).toThrow()
  })

  it('features object is also frozen', async () => {
    'use strict'
    const { config } = await import('../config')
    expect(() => {
      config.features.adminPanel = true
    }).toThrow()
  })
})
