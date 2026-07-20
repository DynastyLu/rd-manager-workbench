import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export class BackupSettings {
  constructor(private readonly settingsFile: string) {}

  async getDirectory(): Promise<string | null> {
    try {
      const parsed = JSON.parse(await readFile(this.settingsFile, 'utf8')) as Record<string, unknown>
      return typeof parsed.directory === 'string' && path.isAbsolute(parsed.directory)
        ? parsed.directory
        : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      return null
    }
  }

  async setDirectory(directory: string): Promise<void> {
    if (!path.isAbsolute(directory)) throw new Error('Backup directory must be absolute')
    const parent = path.dirname(this.settingsFile)
    const temporary = `${this.settingsFile}.tmp`
    await mkdir(parent, { recursive: true })
    try {
      await writeFile(temporary, `${JSON.stringify({ directory }, null, 2)}\n`, { flag: 'wx' })
      await rename(temporary, this.settingsFile)
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }
}
