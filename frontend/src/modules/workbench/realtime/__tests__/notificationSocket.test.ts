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
    io.mockReset()
    socket.on.mockReset()
    socket.off.mockReset()
    socket.disconnect.mockReset()
    io.mockReturnValue(socket)
  })

  it('refreshes from REST on connect and forwards newly created notifications', () => {
    const onReconnect = vi.fn()
    const onNotification = vi.fn()

    const cleanup = subscribeToNotifications({ onReconnect, onNotification })

    expect(io).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/127\.0\.0\.1:4311/),
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
