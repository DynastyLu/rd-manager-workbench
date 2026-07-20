import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { RestoreOrchestrator } from './restore-orchestrator.js'

function child(exitCode = 0, stderr = '') {
  const process = new EventEmitter() as EventEmitter & {
    stdin: PassThrough
    stdout: PassThrough
    stderr: PassThrough
  }
  process.stdin = new PassThrough()
  process.stdout = new PassThrough()
  process.stderr = new PassThrough()
  process.stdin.once('finish', () => {
    if (stderr) process.stderr.write(stderr)
    process.stderr.end()
    process.stdout.end()
    process.emit('close', exitCode)
  })
  return process
}

describe('RestoreOrchestrator', () => {
  const input = {
    backupId: 'backup-1',
    preflightId: 'preflight-1',
    confirmationToken: 'renderer-token',
    expectedHash: 'a'.repeat(64),
  }

  function fixture(exitCode = 0, stderr = '') {
    const events: string[] = []
    const spawned = child(exitCode, stderr)
    let stdin = ''
    spawned.stdin.on('data', (value) => { stdin += value.toString() })
    const spawn = vi.fn(() => spawned)
    const stopBackend = vi.fn(async () => { events.push('stop') })
    const startBackend = vi.fn(async () => { events.push('start') })
    const waitForBackend = vi.fn(async () => { events.push('ready') })
    const orchestrator = new RestoreOrchestrator({
      maintenanceEntry: '/app/backend/dist/src/maintenance.js',
      backendDirectory: '/app/backend',
      backendEnvironment: { DATABASE_URL: 'postgresql://secret@host/db' },
      spawn: spawn as never,
      stopBackend,
      startBackend,
      waitForBackend,
      tokenFactory: () => 'main-process-only-token',
    })
    return { orchestrator, spawn, stopBackend, startBackend, waitForBackend, events, getStdin: () => stdin }
  }

  it('stops the backend, sends secrets through stdin, and restarts only after maintenance exits', async () => {
    const f = fixture()
    await expect(f.orchestrator.restoreBackup(input)).resolves.toBeUndefined()

    expect(f.events).toEqual(['stop', 'start', 'ready'])
    expect(f.spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/app/backend/dist/src/maintenance.js', 'restore'],
      expect.objectContaining({ cwd: '/app/backend', shell: false, stdio: ['pipe', 'pipe', 'pipe'] }),
    )
    const args = JSON.stringify(f.spawn.mock.calls[0]?.slice(0, 2))
    expect(args).not.toContain('main-process-only-token')
    expect(args).not.toContain('renderer-token')
    expect(JSON.parse(f.getStdin())).toEqual({ ...input, maintenanceToken: 'main-process-only-token' })
  })

  it('restarts the backend after a failed restore and sanitizes the renderer error', async () => {
    const f = fixture(1, 'postgresql://user:secret@host/db /private/storage token=abc')
    await expect(f.orchestrator.restoreBackup(input)).rejects.toThrow('本地恢复失败；服务已重新启动。')
    expect(f.startBackend).toHaveBeenCalledTimes(1)
    expect(f.waitForBackend).toHaveBeenCalledTimes(1)
    await expect(f.orchestrator.restoreBackup({ ...input, expectedHash: '../bad' })).rejects.toThrow('恢复请求无效')
    expect(f.stopBackend).toHaveBeenCalledTimes(1)
  })

  it('rejects a concurrent restore before stopping the backend twice', async () => {
    const f = fixture()
    let release!: () => void
    f.stopBackend.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const first = f.orchestrator.restoreBackup(input)
    await new Promise((resolve) => setImmediate(resolve))

    await expect(f.orchestrator.restoreBackup(input)).rejects.toThrow('已有恢复任务正在执行')
    expect(f.stopBackend).toHaveBeenCalledTimes(1)
    release()
    await expect(first).resolves.toBeUndefined()
  })
})
