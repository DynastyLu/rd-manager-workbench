import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BackupSettings } from './backup-settings.js'

describe('BackupSettings', () => {
  it('persists only an absolute user-selected backup directory with an atomic JSON file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rd-backup-settings-'))
    const settingsFile = path.join(root, 'settings', 'backup.json')
    const settings = new BackupSettings(settingsFile)

    await expect(settings.setDirectory('../escape')).rejects.toThrow('absolute')
    await settings.setDirectory(path.join(root, 'backups'))

    await expect(settings.getDirectory()).resolves.toBe(path.join(root, 'backups'))
    await expect(readFile(settingsFile, 'utf8')).resolves.toContain(path.join(root, 'backups'))
  })
})
