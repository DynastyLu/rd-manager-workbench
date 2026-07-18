import { beforeEach, describe, expect, it, vi } from 'vitest'

import { subscribeToNotifications } from '../notificationSocket'

const { io, socket } = vi.hoisted(() => ({
  io: vi.fn(),
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  },
}))

vi.mock('socket.io-client', () => ({ io }))

describe('notification socket', () => {
  beforeEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(window, '__APP_CONFIG__')
    io.mockReset()
    socket.on.mockReset()
    socket.off.mockReset()
    socket.disconnect.mockReset()
    io.mockReturnValue(socket)
  })

  it('prefers the runtime socket URL embedded in the production config file', async () => {
    window.__APP_CONFIG__ = { socketUrl: 'http://127.0.0.1:4999/' }
    const { subscribeToNotifications: subscribeWithRuntimeConfig } = await import(
      '../notificationSocket'
    )

    const cleanup = subscribeWithRuntimeConfig({
      onReconnect: vi.fn(),
      onNotification: vi.fn(),
    })

    expect(io).toHaveBeenCalledWith(
      'http://127.0.0.1:4999/notifications',
      expect.objectContaining({ transports: ['websocket'] }),
    )
    cleanup()
  })

  it('refreshes from REST on connect and forwards newly created notifications', () => {
    const onReconnect = vi.fn()
    const onNotification = vi.fn()

    const cleanup = subscribeToNotifications({ onReconnect, onNotification })

    expect(io).toHaveBeenCalledWith(
      'http://127.0.0.1:4311/notifications',
      expect.objectContaining({ transports: ['websocket'] }),
    )
    const handlers = Object.fromEntries(socket.on.mock.calls)
    handlers.connect()
    handlers['notification.created']({ id: 'notification-1' })
    expect(onReconnect).toHaveBeenCalledTimes(1)
    expect(onNotification).toHaveBeenCalledWith({ id: 'notification-1' })

    cleanup()
    expect(socket.off).toHaveBeenCalledWith('connect', handlers.connect)
    expect(socket.off).toHaveBeenCalledWith(
      'notification.created',
      handlers['notification.created'],
    )
    expect(socket.disconnect).toHaveBeenCalledTimes(1)
  })
})
