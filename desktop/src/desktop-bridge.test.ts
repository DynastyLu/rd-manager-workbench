import { describe, expect, it, vi } from 'vitest'
import { createDesktopBridge } from './desktop-bridge.js'

describe('createDesktopBridge', () => {
  it('exposes narrow credential and extension methods without secret reads or arbitrary IPC/fetch', async () => {
    const invoke = vi.fn(async () => undefined)
    const on = vi.fn()
    const bridge = createDesktopBridge({ invoke, on })

    expect(Object.keys(bridge.credentials)).toEqual(['isAvailable', 'put', 'has', 'delete'])
    expect(bridge.credentials).not.toHaveProperty('get')
    expect(bridge).not.toHaveProperty('invoke')
    expect(bridge).not.toHaveProperty('fetch')
    await bridge.credentials.put('profile.sms', { accessKeyId: 'example' })
    await bridge.extensions.execute({
      runId: 'run-1',
      profile: {
        id: 'profile-1',
        kind: 'SMS',
        provider: 'LOCAL_PREVIEW',
        enabled: true,
        publicConfig: {},
      },
      operation: 'TEST_CONNECTION',
      payload: {},
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'desktop:credentials:put', {
      ref: 'profile.sms',
      secretObject: { accessKeyId: 'example' },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'desktop:extensions:execute', expect.any(Object))
  })

  it('preserves notification, backup selection and restore methods', () => {
    const bridge = createDesktopBridge({ invoke: vi.fn(), on: vi.fn() })
    expect(bridge).toHaveProperty('onNotificationClicked')
    expect(bridge).toHaveProperty('chooseBackupDirectory')
    expect(bridge).toHaveProperty('restoreBackup')
  })
})
