import {
  extensionKinds,
  extensionOperations,
  extensionProviders,
  type ExtensionExecutionInput,
  type ExtensionExecutionResult,
  type ExtensionOperation,
  type ExtensionProvider,
} from './contracts.js'

type Credential = Record<string, unknown> | undefined
type ProviderHandler = (
  input: ExtensionExecutionInput,
  credential: Credential,
) => Promise<ExtensionExecutionResult>

interface RegisteredProvider {
  operations: ReadonlySet<ExtensionOperation>
  handler: ProviderHandler
}

const MAX_PAYLOAD_BYTES = 1024 * 1024

function assertPlainRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('EXTENSION_PAYLOAD_INVALID')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('EXTENSION_PAYLOAD_INVALID')
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error('EXTENSION_PAYLOAD_INVALID')
    }
    if (typeof child === 'object' && child !== null) {
      if (Array.isArray(child)) {
        child.forEach((entry) => {
          if (typeof entry === 'object' && entry !== null) assertPlainRecord(entry)
        })
      } else {
        assertPlainRecord(child)
      }
    }
  }
}

function assertExecutionInput(input: ExtensionExecutionInput): void {
  if (!input || typeof input !== 'object') throw new Error('EXTENSION_PAYLOAD_INVALID')
  if (!extensionKinds.includes(input.profile?.kind)) throw new Error('EXTENSION_KIND_UNSUPPORTED')
  if (!extensionProviders.includes(input.profile?.provider)) {
    throw new Error('EXTENSION_PROVIDER_UNSUPPORTED')
  }
  if (!extensionOperations.includes(input.operation)) {
    throw new Error('EXTENSION_OPERATION_UNSUPPORTED')
  }
  assertPlainRecord(input.profile.publicConfig)
  assertPlainRecord(input.payload)
  if (Buffer.byteLength(JSON.stringify(input.payload), 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new Error('EXTENSION_PAYLOAD_TOO_LARGE')
  }
}

export class ProviderRegistry {
  private readonly providers = new Map<ExtensionProvider, RegisteredProvider>()

  register(
    provider: ExtensionProvider,
    operations: readonly ExtensionOperation[],
    handler: ProviderHandler,
  ): void {
    if (!extensionProviders.includes(provider)) throw new Error('EXTENSION_PROVIDER_UNSUPPORTED')
    this.providers.set(provider, { operations: new Set(operations), handler })
  }

  async execute(
    input: ExtensionExecutionInput,
    credential: Credential,
  ): Promise<ExtensionExecutionResult> {
    this.validate(input)
    return this.providers.get(input.profile.provider)!.handler(input, credential)
  }

  validate(input: ExtensionExecutionInput): void {
    assertExecutionInput(input)
    const provider = this.providers.get(input.profile.provider)
    if (!provider) throw new Error('EXTENSION_PROVIDER_UNSUPPORTED')
    if (!provider.operations.has(input.operation)) {
      throw new Error('EXTENSION_OPERATION_UNSUPPORTED')
    }
  }
}
