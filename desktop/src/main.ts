import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, Menu, nativeImage, Notification, Tray } from 'electron'
import { io, type Socket } from 'socket.io-client'
import { normalizeSourcePath, resolveBackendEntry, resolveRendererTarget } from './runtime.js'

interface RealtimeNotification {
  id: string
  title: string
  body: string
  sourcePath: string
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDirectory, '..', '..')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let backendProcess: ChildProcess | null = null
let notificationSocket: Socket | null = null
const shownNotificationIds = new Set<string>()
let isQuitting = false
let pendingSourcePath: string | null = null

function runtimeInput() {
  return {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
    rendererUrl: process.env['RD_WORKBENCH_RENDERER_URL'],
    backendEntry: process.env['RD_WORKBENCH_BACKEND_ENTRY'],
  }
}

function startBackend() {
  const entry = resolveBackendEntry(runtimeInput())
  if (!entry) return
  backendProcess = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: process.env['NODE_ENV'] ?? 'local',
      HOST: '127.0.0.1',
      PORT: process.env['PORT'] ?? '4311',
      DATABASE_URL:
        process.env['DATABASE_URL'] ??
        'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app',
      LOCAL_STORAGE_ROOT: process.env['LOCAL_STORAGE_ROOT'] ?? path.join(app.getPath('userData'), 'storage'),
    },
    stdio: 'inherit',
  })
  backendProcess.on('error', (error) => {
    dialog.showErrorBox('本地服务启动失败', error.message)
  })
  backendProcess.on('exit', (code, signal) => {
    if (!isQuitting && code !== 0) {
      dialog.showErrorBox('本地服务已停止', `退出码：${String(code)}，信号：${String(signal)}`)
    }
  })
}

async function waitForBackend(attempts = 50): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4311/api/health', { signal: AbortSignal.timeout(500) })
      if (response.ok) return
    } catch {
      // The local Nest process may still be starting or applying its Prisma client.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('本地服务在 10 秒内未就绪，请检查 PostgreSQL 是否已经启动。')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    title: '研发工作台',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const target = resolveRendererTarget(runtimeInput())
  if (target.kind === 'url') void mainWindow.loadURL(target.value)
  else void mainWindow.loadFile(target.value)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('did-finish-load', () => {
    if (!pendingSourcePath) return
    mainWindow?.webContents.send('desktop:notification-clicked', pendingSourcePath)
    pendingSourcePath = null
  })
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
}

function showMainWindow(sourcePath?: string) {
  if (!mainWindow) createWindow()
  mainWindow?.show()
  mainWindow?.focus()
  if (sourcePath) {
    const normalizedPath = normalizeSourcePath(sourcePath)
    if (mainWindow?.webContents.isLoading()) pendingSourcePath = normalizedPath
    else mainWindow?.webContents.send('desktop:notification-clicked', normalizedPath)
  }
}

function createTray() {
  const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="4" fill="#3370ff"/><path d="M5 5h5.2a3 3 0 0 1 0 6H8v2H5V5Zm3 2.4v1.2h2a.6.6 0 0 0 0-1.2H8Z" fill="white"/></svg>`
  const trayIcon = nativeImage
    .createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(traySvg)}`)
    .resize({ width: 18, height: 18 })
  tray = new Tray(trayIcon)
  tray.setToolTip('研发工作台')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开研发工作台', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('double-click', () => showMainWindow())
}

function connectNotifications() {
  const socketUrl = process.env['RD_WORKBENCH_SOCKET_URL'] ?? 'http://127.0.0.1:4311/notifications'
  notificationSocket = io(socketUrl, { transports: ['websocket'], reconnection: true })
  notificationSocket.on('notification.created', (payload: RealtimeNotification) => {
    if (!payload?.id || shownNotificationIds.has(payload.id)) return
    shownNotificationIds.add(payload.id)
    const nativeNotification = new Notification({ title: payload.title, body: payload.body })
    nativeNotification.on('click', () => showMainWindow(payload.sourcePath))
    nativeNotification.show()
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else {
  app.on('second-instance', () => showMainWindow())
  app.whenReady().then(async () => {
    startBackend()
    try {
      await waitForBackend()
    } catch (error) {
      dialog.showErrorBox('无法启动研发工作台', error instanceof Error ? error.message : String(error))
    }
    createWindow()
    createTray()
    connectNotifications()
  })
  app.on('activate', () => showMainWindow())
  app.on('before-quit', () => { isQuitting = true })
  app.on('will-quit', () => {
    notificationSocket?.disconnect()
    backendProcess?.kill('SIGTERM')
  })
}
