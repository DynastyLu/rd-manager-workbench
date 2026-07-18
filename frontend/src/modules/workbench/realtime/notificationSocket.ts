import { io } from 'socket.io-client'
import type { WorkbenchNotification } from '@/modules/workbench/api/notifications'

export interface NotificationSocketHandlers {
  onReconnect: () => void
  onNotification: (notification: WorkbenchNotification) => void
}

function getSocketUrl(): string {
  const environment = import.meta.env as unknown as Record<string, unknown>
  const configuredSocketUrl = environment['VITE_SOCKET_URL']
  if (typeof configuredSocketUrl === 'string' && configuredSocketUrl.trim()) {
    return configuredSocketUrl.trim().replace(/\/$/, '')
  }

  const configuredApiUrl = environment['VITE_API_BASE_URL']
  if (typeof configuredApiUrl === 'string' && configuredApiUrl.trim()) {
    return configuredApiUrl.trim().replace(/\/api\/?$/, '').replace(/\/$/, '')
  }

  return 'http://127.0.0.1:4311'
}

export function subscribeToNotifications(handlers: NotificationSocketHandlers): () => void {
  const socket = io(`${getSocketUrl()}/notifications`, {
    transports: ['websocket'],
    reconnection: true,
  })
  const handleConnect = () => handlers.onReconnect()
  const handleNotification = (notification: WorkbenchNotification) =>
    handlers.onNotification(notification)

  socket.on('connect', handleConnect)
  socket.on('notification.created', handleNotification)

  return () => {
    socket.off('connect', handleConnect)
    socket.off('notification.created', handleNotification)
    socket.disconnect()
  }
}
