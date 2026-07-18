import { contextBridge, ipcRenderer } from 'electron'
import { NotificationClickBuffer } from './notification-click-buffer.js'

const notificationClickBuffer = new NotificationClickBuffer()

ipcRenderer.on('desktop:notification-clicked', (_event, sourcePath: string) => {
  notificationClickBuffer.push(sourcePath)
})

contextBridge.exposeInMainWorld('rdWorkbenchDesktop', {
  onNotificationClicked(callback: (sourcePath: string) => void) {
    return notificationClickBuffer.subscribe(callback)
  },
})
