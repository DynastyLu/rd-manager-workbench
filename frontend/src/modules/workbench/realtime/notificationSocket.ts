import { io } from 'socket.io-client'
import { config } from '@/lib/config'
import type { WorkbenchNotification } from '@/modules/workbench/api/notifications'

export interface NotificationSocketHandlers {
  onReconnect: () => void
  onNotification: (notification: WorkbenchNotification) => void
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
