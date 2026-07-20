import type { ExtensionExecutionInput, ExtensionExecutionResult } from './extensions/contracts.js'

export interface DesktopIpcPort {
  invoke(channel: string, input?: unknown): Promise<unknown>
  on(channel: string, callback: (_event: unknown, sourcePath: string) => void): void
}

export interface RestoreBackupInput {
  backupId: string
  preflightId: string
  confirmationToken: string
  expectedHash: string
}

export function createDesktopBridge(
  ipc: DesktopIpcPort,
  subscribeNotification?: (callback: (sourcePath: string) => void) => () => void,
) {
  return {
    onNotificationClicked(callback: (sourcePath: string) => void) {
      return subscribeNotification?.(callback) ?? (() => undefined)
    },
    chooseBackupDirectory() {
      return ipc.invoke('desktop:choose-backup-directory') as Promise<string | null>
    },
    restoreBackup(input: RestoreBackupInput) {
      return ipc.invoke('desktop:restore-backup', input) as Promise<void>
    },
    credentials: {
      isAvailable() {
        return ipc.invoke('desktop:credentials:is-available') as Promise<boolean>
      },
      put(ref: string, secretObject: Record<string, unknown>) {
        return ipc.invoke('desktop:credentials:put', { ref, secretObject }) as Promise<void>
      },
      has(ref: string) {
        return ipc.invoke('desktop:credentials:has', { ref }) as Promise<boolean>
      },
      delete(ref: string) {
        return ipc.invoke('desktop:credentials:delete', { ref }) as Promise<void>
      },
    },
    extensions: {
      execute(input: ExtensionExecutionInput) {
        return ipc.invoke('desktop:extensions:execute', input) as Promise<ExtensionExecutionResult>
      },
    },
  }
}

export type RdWorkbenchDesktopBridge = ReturnType<typeof createDesktopBridge>
