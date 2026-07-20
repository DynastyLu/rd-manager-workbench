import { randomBytes } from 'node:crypto'
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'

export interface DesktopRestoreInput {
  backupId: string
  preflightId: string
  confirmationToken: string
  expectedHash: string
}

interface RestoreOrchestratorOptions {
  maintenanceEntry: string
  backendDirectory: string
  backendEnvironment: NodeJS.ProcessEnv
  spawn?: (
    executable: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { shell: false; stdio: ['pipe', 'pipe', 'pipe'] },
  ) => ChildProcessWithoutNullStreams
  stopBackend: () => Promise<void>
  startBackend: () => Promise<void>
  waitForBackend: () => Promise<void>
  tokenFactory?: () => string
}

export class RestoreOrchestrator {
  private readonly spawn: NonNullable<RestoreOrchestratorOptions['spawn']>
  private readonly tokenFactory: () => string
  private restoring = false

  constructor(private readonly options: RestoreOrchestratorOptions) {
    this.spawn = options.spawn ?? ((executable, args, spawnOptions) =>
      nodeSpawn(executable, [...args], spawnOptions))
    this.tokenFactory = options.tokenFactory ?? (() => randomBytes(32).toString('base64url'))
  }

  async restoreBackup(input: DesktopRestoreInput): Promise<void> {
    this.validate(input)
    if (this.restoring) throw new Error('已有恢复任务正在执行')
    this.restoring = true
    try {
      let stopped = false
      let restoreFailure = false
      try {
        await this.options.stopBackend()
        stopped = true
        await this.runMaintenance(input)
      } catch {
        restoreFailure = true
      } finally {
        if (stopped) {
          try {
            await this.options.startBackend()
            await this.options.waitForBackend()
          } catch {
            throw new Error('本地服务重启失败，请重新打开研发工作台。')
          }
        }
      }
      if (restoreFailure) throw new Error('本地恢复失败；服务已重新启动。')
    } finally {
      this.restoring = false
    }
  }

  private validate(input: DesktopRestoreInput) {
    if (
      !input
      || !this.isId(input.backupId)
      || !this.isId(input.preflightId)
      || typeof input.confirmationToken !== 'string'
      || input.confirmationToken.length < 8
      || !/^[a-f0-9]{64}$/.test(input.expectedHash)
    ) {
      throw new Error('恢复请求无效')
    }
  }

  private isId(value: string) {
    return typeof value === 'string' && value.length > 0 && value.length <= 120 && /^[a-zA-Z0-9_-]+$/.test(value)
  }

  private async runMaintenance(input: DesktopRestoreInput) {
    const maintenanceToken = this.tokenFactory()
    const child = this.spawn(
      process.execPath,
      [this.options.maintenanceEntry, 'restore'],
      {
        cwd: this.options.backendDirectory,
        env: {
          ...this.options.backendEnvironment,
          RD_MAINTENANCE_MODE: '1',
          RD_MAINTENANCE_TOKEN: maintenanceToken,
        },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    child.stdin.end(JSON.stringify({ ...input, maintenanceToken }))
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (error) reject(error)
        else resolve()
      }
      child.once('error', () => finish(new Error('Unable to start restore maintenance')))
      child.once('close', (code) => {
        if (code === 0) finish()
        else finish(new Error('Restore maintenance failed'))
      })
    })
  }
}
