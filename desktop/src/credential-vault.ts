import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

export interface EncryptionAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type SecretObject = Record<string, unknown>
type VaultDocument = Record<string, string>

const CREDENTIAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MAX_CREDENTIAL_BYTES = 64 * 1024

function error(code: string): Error {
  return new Error(code)
}

function isPlainSecret(value: unknown): value is SecretObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validateRef(ref: string): void {
  if (!CREDENTIAL_REF.test(ref)) throw error('CREDENTIAL_REF_INVALID')
}

function parseVault(value: string): VaultDocument {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isPlainSecret(parsed)) throw error('CREDENTIAL_VAULT_CORRUPTED')
    for (const [ref, encrypted] of Object.entries(parsed)) {
      validateRef(ref)
      if (typeof encrypted !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted)) {
        throw error('CREDENTIAL_VAULT_CORRUPTED')
      }
    }
    return parsed as VaultDocument
  } catch (caught) {
    if (caught instanceof Error && caught.message === 'CREDENTIAL_VAULT_CORRUPTED') throw caught
    throw error('CREDENTIAL_VAULT_CORRUPTED')
  }
}

export class CredentialVault {
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly encryption: EncryptionAdapter,
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.encryption.isEncryptionAvailable()
  }

  async put(ref: string, secretObject: SecretObject): Promise<void> {
    this.assertAvailable()
    validateRef(ref)
    if (!isPlainSecret(secretObject)) throw error('CREDENTIAL_VALUE_INVALID')
    let serialized: string
    try {
      serialized = JSON.stringify(secretObject)
    } catch {
      throw error('CREDENTIAL_VALUE_INVALID')
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CREDENTIAL_BYTES) {
      throw error('CREDENTIAL_VALUE_TOO_LARGE')
    }
    const encrypted = this.encryption.encryptString(serialized).toString('base64')
    await this.enqueueMutation(async () => {
      const current = await this.readDocument()
      await this.writeDocument({ ...current, [ref]: encrypted })
    })
  }

  async has(ref: string): Promise<boolean> {
    this.assertAvailable()
    validateRef(ref)
    await this.mutationQueue
    const current = await this.readDocument()
    return Object.hasOwn(current, ref)
  }

  async delete(ref: string): Promise<void> {
    this.assertAvailable()
    validateRef(ref)
    await this.enqueueMutation(async () => {
      const current = await this.readDocument()
      if (!Object.hasOwn(current, ref)) return
      const { [ref]: _removed, ...remaining } = current
      await this.writeDocument(remaining)
    })
  }

  async withCredential<T>(
    ref: string,
    callback: (credential: SecretObject) => Promise<T>,
  ): Promise<T> {
    this.assertAvailable()
    validateRef(ref)
    await this.mutationQueue
    const current = await this.readDocument()
    const encrypted = current[ref]
    if (!encrypted) throw error('CREDENTIAL_NOT_FOUND')
    let credential: SecretObject
    try {
      const decoded = Buffer.from(encrypted, 'base64')
      const value = JSON.parse(this.encryption.decryptString(decoded)) as unknown
      if (!isPlainSecret(value)) throw error('CREDENTIAL_VAULT_CORRUPTED')
      credential = value
    } catch (caught) {
      if (caught instanceof Error && caught.message === 'CREDENTIAL_VAULT_CORRUPTED') throw caught
      throw error('CREDENTIAL_VAULT_CORRUPTED')
    }
    try {
      return await callback(credential)
    } finally {
      for (const key of Object.keys(credential)) delete credential[key]
    }
  }

  private assertAvailable(): void {
    if (!this.encryption.isEncryptionAvailable()) throw error('CREDENTIAL_STORE_UNAVAILABLE')
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const result = this.mutationQueue.then(operation)
    this.mutationQueue = result.catch(() => undefined)
    return result
  }

  private async readDocument(): Promise<VaultDocument> {
    try {
      return parseVault(await readFile(this.filePath, 'utf8'))
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw caught
    }
  }

  private async writeDocument(document: VaultDocument): Promise<void> {
    const directory = path.dirname(this.filePath)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporaryPath = path.join(directory, `.${path.basename(this.filePath)}.${randomUUID()}.tmp`)
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(document), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await rename(temporaryPath, this.filePath)
      await chmod(this.filePath, 0o600)
    } catch (caught) {
      await unlink(temporaryPath).catch(() => undefined)
      throw caught
    }
  }
}
