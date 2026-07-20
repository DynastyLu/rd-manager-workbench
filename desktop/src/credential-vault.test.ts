import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CredentialVault } from './credential-vault.js'

function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: vi.fn(() => available),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, 'utf8')),
    decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^encrypted:/, '')),
  }
}

describe('CredentialVault', () => {
  it('refuses every operation when operating-system encryption is unavailable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rd-credential-vault-'))
    const vault = new CredentialVault(path.join(root, 'credentials.json'), fakeSafeStorage(false))

    await expect(vault.isAvailable()).resolves.toBe(false)
    await expect(vault.put('profile.sms', { accessKeySecret: 'plain-secret' })).rejects.toThrow(
      'CREDENTIAL_STORE_UNAVAILABLE',
    )
    await expect(vault.has('profile.sms')).rejects.toThrow('CREDENTIAL_STORE_UNAVAILABLE')
    await expect(vault.delete('profile.sms')).rejects.toThrow('CREDENTIAL_STORE_UNAVAILABLE')
  })

  it('atomically persists only encrypted bytes with owner-only permissions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rd-credential-vault-'))
    const file = path.join(root, 'vault', 'credentials.json')
    const vault = new CredentialVault(file, fakeSafeStorage())

    await vault.put('profile.sms', { accessKeyId: 'example-id', accessKeySecret: 'plain-secret' })

    const contents = await readFile(file, 'utf8')
    expect(contents).not.toContain('plain-secret')
    expect(contents).not.toContain('example-id')
    expect(contents).toContain('ZW5jcnlwdGVk')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    await expect(vault.has('profile.sms')).resolves.toBe(true)
    await vault.delete('profile.sms')
    await expect(vault.has('profile.sms')).resolves.toBe(false)
  })

  it('rejects malformed refs, non-object secrets and a corrupted vault without leaking content', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rd-credential-vault-'))
    const file = path.join(root, 'credentials.json')
    const vault = new CredentialVault(file, fakeSafeStorage())

    await expect(vault.put('../escape', { token: 'secret' })).rejects.toThrow('CREDENTIAL_REF_INVALID')
    await expect(vault.put('profile.sms', [] as never)).rejects.toThrow('CREDENTIAL_VALUE_INVALID')
    await writeFile(file, '{"profile.sms":"not-base64***"}', { mode: 0o600 })
    await expect(vault.has('profile.sms')).rejects.toThrow('CREDENTIAL_VAULT_CORRUPTED')
    await expect(vault.put('profile.ai', { apiKey: 'new-secret' })).rejects.toThrow(
      'CREDENTIAL_VAULT_CORRUPTED',
    )
  })

  it('decrypts a credential only inside an internal callback and clears the temporary object', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rd-credential-vault-'))
    const vault = new CredentialVault(path.join(root, 'credentials.json'), fakeSafeStorage())
    await vault.put('profile.ai', { apiKey: 'secret-value' })
    let received: Record<string, unknown> | undefined

    const result = await vault.withCredential('profile.ai', async (credential) => {
      received = credential
      return String(credential.apiKey).length
    })

    expect(result).toBe(12)
    expect(received).toEqual({})
    await expect(vault.withCredential('missing', async () => undefined)).rejects.toThrow(
      'CREDENTIAL_NOT_FOUND',
    )
  })

  it('serializes concurrent updates so one credential cannot overwrite another', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rd-credential-vault-'))
    const vault = new CredentialVault(path.join(root, 'credentials.json'), fakeSafeStorage())

    await Promise.all([
      vault.put('profile.sms', { token: 'sms-secret' }),
      vault.put('profile.ai', { token: 'ai-secret' }),
    ])

    await expect(vault.has('profile.sms')).resolves.toBe(true)
    await expect(vault.has('profile.ai')).resolves.toBe(true)
  })

  it('rejects oversized credential values before encrypting or growing the vault file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rd-credential-vault-'))
    const encryption = fakeSafeStorage()
    const vault = new CredentialVault(path.join(root, 'credentials.json'), encryption)

    await expect(vault.put('profile.ai', { apiKey: 'x'.repeat(65 * 1024) }))
      .rejects.toThrow('CREDENTIAL_VALUE_TOO_LARGE')
    expect(encryption.encryptString).not.toHaveBeenCalled()
  })
})
