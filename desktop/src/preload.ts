import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('rdWorkbenchDesktop', {
  onNotificationClicked(callback: (sourcePath: string) => void) {
    const listener = (_event: Electron.IpcRendererEvent, sourcePath: string) => callback(sourcePath)
    ipcRenderer.on('desktop:notification-clicked', listener)
    return () => ipcRenderer.removeListener('desktop:notification-clicked', listener)
  },
})
