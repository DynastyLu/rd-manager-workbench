import { describe, it, expect, beforeEach, vi } from 'vitest'

type WindowWithConfig = Window & {
  __APP_CONFIG__?: {
    sentryDsn?: string
    apiBaseUrl?: string
    socketUrl?: string
  }
}

describe('config module', () => {
  beforeEach(() => {
    vi.resetModules()
    // 每个测试前清除 window.__APP_CONFIG__，确保隔离
    delete (window as WindowWithConfig).__APP_CONFIG__
  })

  it('falls back to an empty Sentry DSN when runtime configuration is absent', async () => {
    const { config } = await import('../config')
    expect(config.sentryDsn).toBe('')
  })

  it('uses window.__APP_CONFIG__ values when present', async () => {
    // 模拟运维修改了 public/config.js 的效果
    ;(window as WindowWithConfig).__APP_CONFIG__ = {
      sentryDsn: 'test-dsn',
      apiBaseUrl: 'http://127.0.0.1:4311/api',
      socketUrl: 'http://127.0.0.1:4311',
    }
    const { config } = await import('../config')
    delete (window as WindowWithConfig).__APP_CONFIG__
    expect(config.sentryDsn).toBe('test-dsn')
    expect(config.apiBaseUrl).toBe('http://127.0.0.1:4311/api')
    expect(config.socketUrl).toBe('http://127.0.0.1:4311')
  })

  it('config object is frozen — mutations throw in strict mode', async () => {
    'use strict'
    const { config } = await import('../config')
    expect(() => {
      // @ts-expect-error — 测试运行时 freeze 行为
      config.sentryDsn = 'evil-dsn'
    }).toThrow()
  })
})
