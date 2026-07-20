import type { CredentialVault } from './credential-vault.js'
import type { ExtensionExecutionInput } from './extensions/contracts.js'
import type { ProviderRegistry } from './extensions/provider-registry.js'

interface IpcRegistrar {
  handle(channel: string, handler: (_event: unknown, input?: unknown) => Promise<unknown>): void
}

interface CredentialVaultPort {
  isAvailable(): Promise<boolean>
  put(ref: string, value: Record<string, unknown>): Promise<void>
  has(ref: string): Promise<boolean>
  delete(ref: string): Promise<void>
  withCredential<T>(ref: string, callback: (credential: Record<string, unknown>) => Promise<T>): Promise<T>
}

interface ProviderRegistryPort {
  validate?(input: ExtensionExecutionInput): void
  execute(input: ExtensionExecutionInput, credential: Record<string, unknown> | undefined): Promise<unknown>
}

function credentialInput(input: unknown): { ref: string; secretObject?: Record<string, unknown> } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('EXTENSION_PAYLOAD_INVALID')
  }
  const value = input as Record<string, unknown>
  return { ref: String(value.ref ?? ''), secretObject: value.secretObject as Record<string, unknown> }
}

export function configureExtensionIpc(
  ipc: IpcRegistrar,
  vault: CredentialVaultPort | CredentialVault,
  registry: ProviderRegistryPort | ProviderRegistry,
): void {
  ipc.handle('desktop:credentials:is-available', async () => vault.isAvailable())
  ipc.handle('desktop:credentials:put', async (_event, input) => {
    const value = credentialInput(input)
    await vault.put(value.ref, value.secretObject as Record<string, unknown>)
  })
  ipc.handle('desktop:credentials:has', async (_event, input) => {
    const value = credentialInput(input)
    return vault.has(value.ref)
  })
  ipc.handle('desktop:credentials:delete', async (_event, input) => {
    const value = credentialInput(input)
    await vault.delete(value.ref)
  })
  ipc.handle('desktop:extensions:execute', async (_event, input) => {
    const execution = input as ExtensionExecutionInput
    return executeExtensionWithCredentials(vault, registry, execution)
  })
}

export async function executeExtensionWithCredentials(
  vault: CredentialVaultPort | CredentialVault,
  registry: ProviderRegistryPort | ProviderRegistry,
  execution: ExtensionExecutionInput,
): Promise<unknown> {
  registry.validate?.(execution)
  if (!execution?.profile?.enabled) throw new Error('EXTENSION_PROFILE_DISABLED')
  const executeWithRecipient = async (providerCredential?: Record<string, unknown>) => {
    const recipientRef = execution.operation === 'SMS_SEND' || execution.operation === 'SMS_PREVIEW'
      ? execution.payload.recipientCredentialRef
      : undefined
    if (typeof recipientRef !== 'string') return registry.execute(execution, providerCredential)
    return vault.withCredential(recipientRef, async (recipient) => {
      const credential = providerCredential ?? {}
      credential.recipient = recipient
      try {
        return await registry.execute(execution, credential)
      } finally {
        delete credential.recipient
      }
    })
  }
  const credentialRef = execution.profile.credentialRef
  if (!credentialRef) return executeWithRecipient()
  return vault.withCredential(credentialRef, executeWithRecipient)
}
