import { contextBridge, ipcRenderer } from 'electron'
import { NotificationClickBuffer } from './notification-click-buffer.js'
import { createDesktopBridge } from './desktop-bridge.js'

const notificationClickBuffer = new NotificationClickBuffer()

ipcRenderer.on('desktop:notification-clicked', (_event, sourcePath: string) => {
  notificationClickBuffer.push(sourcePath)
})

contextBridge.exposeInMainWorld(
  'rdWorkbenchDesktop',
  createDesktopBridge(ipcRenderer, (callback) => notificationClickBuffer.subscribe(callback)),
)
