import { io, type Socket } from 'socket.io-client'
import { config } from '@/lib/config'
import { useAuthStore } from '@/modules/auth/store'
import type { WorkbenchNotification } from '@/modules/workbench/api/notifications'

export interface NotificationSocketHandlers {
  onReconnect?: () => void
  onNotification?: (notification: WorkbenchNotification) => void
  onPermissionChange?: () => void
  onSessionRevoked?: () => void
}

function getSocketUrl(): string {
  if (config.socketUrl) {
    return config.socketUrl.replace(/\/$/, '')
  }

  if (config.apiBaseUrl) {
    return config.apiBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  }

  return 'http://127.0.0.1:4311'
}

export function subscribeToNotifications(handlers: NotificationSocketHandlers): () => void {
  const socket: Socket = io(`${getSocketUrl()}/notifications`, {
    transports: ['websocket'],
    reconnection: true,
    auth: () => ({
      token: useAuthStore.getState().accessToken,
    }),
  })

  const handleConnect = () => handlers.onReconnect?.()
  const handleNotification = (notification: WorkbenchNotification) =>
    handlers.onNotification?.(notification)
  const handlePermissionChange = () => handlers.onPermissionChange?.()
  const handleSessionRevoked = () => {
    socket.io.opts.reconnection = false
    socket.disconnect()
    handlers.onSessionRevoked?.()
  }

  socket.on('connect', handleConnect)
  socket.on('notification.created', handleNotification)
  socket.on('auth.permissions.changed', handlePermissionChange)
  socket.on('auth.session.revoked', handleSessionRevoked)

  return () => {
    socket.off('connect', handleConnect)
    socket.off('notification.created', handleNotification)
    socket.off('auth.permissions.changed', handlePermissionChange)
    socket.off('auth.session.revoked', handleSessionRevoked)
    socket.disconnect()
  }
}
