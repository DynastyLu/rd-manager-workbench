import { createHash } from 'node:crypto'
import {
  extensionKinds,
  extensionOperations,
  extensionProviders,
  type ExtensionExecutionInput,
  type ExtensionExecutionResult,
} from './extensions/contracts.js'

interface SocketPort {
  on(event: string, handler: (event: unknown) => Promise<void>): void
  off(event: string, handler: (event: unknown) => Promise<void>): void
}

interface CompletionInput {
  completionToken: string
  status: 'SUCCEEDED' | 'FAILED' | 'REJECTED'
  output?: Record<string, unknown>
  errorCode?: string
  metadata?: Record<string, unknown>
}

interface ExtensionRunBrokerOptions {
  socket: SocketPort
  execute(input: ExtensionExecutionInput): Promise<ExtensionExecutionResult>
  complete(runId: string, input: CompletionInput): Promise<void>
}

interface ExtensionRunRequestedEvent extends ExtensionExecutionInput {
  inputSha256: string
  completionToken: string
  deliveryId?: string
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function parseEvent(value: unknown): ExtensionRunRequestedEvent {
  if (!isPlainRecord(value) || !isPlainRecord(value.profile) || !isPlainRecord(value.payload)) {
    throw new Error('EXTENSION_EVENT_INVALID')
  }
  const profile = value.profile
  if (
    typeof value.runId !== 'string'
    || typeof value.inputSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.inputSha256)
    || typeof value.completionToken !== 'string'
    || value.completionToken.length < 8
    || typeof profile.id !== 'string'
    || typeof profile.enabled !== 'boolean'
    || !extensionKinds.includes(profile.kind as never)
    || !extensionProviders.includes(profile.provider as never)
    || typeof value.operation !== 'string'
    || !extensionOperations.includes(value.operation as never)
    || !isPlainRecord(profile.publicConfig)
  ) throw new Error('EXTENSION_EVENT_INVALID')
  return value as unknown as ExtensionRunRequestedEvent
}

function completionFromResult(
  token: string,
  result: ExtensionExecutionResult,
): CompletionInput {
  return {
    completionToken: token,
    status: result.status,
    ...(result.output ? { output: result.output } : {}),
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    ...(result.metadata ? { metadata: result.metadata } : {}),
  }
}

export class ExtensionRunBroker {
  private readonly completed = new Set<string>()
  private readonly pendingCompletion = new Map<string, CompletionInput>()
  private readonly inFlight = new Map<string, Promise<void>>()
  private started = false
  private readonly requestedHandler = async (value: unknown) => {
    try {
      await this.handleRequested(value)
    } catch {
      // Keep the cached completion for a socket redelivery; never log payloads or credentials.
    }
  }

  constructor(private readonly options: ExtensionRunBrokerOptions) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.options.socket.on('extension.run.requested', this.requestedHandler)
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.options.socket.off('extension.run.requested', this.requestedHandler)
  }

  private async handleRequested(value: unknown): Promise<void> {
    const event = parseEvent(value)
    if (this.completed.has(event.runId)) return
    const current = this.inFlight.get(event.runId)
    if (current) return current
    const operation = this.process(event)
    this.inFlight.set(event.runId, operation)
    try {
      await operation
    } finally {
      this.inFlight.delete(event.runId)
    }
  }

  private async process(event: ExtensionRunRequestedEvent): Promise<void> {
    let completion = this.pendingCompletion.get(event.runId)
    if (!completion) {
      if (payloadHash(event.payload) !== event.inputSha256) {
        completion = {
          completionToken: event.completionToken,
          status: 'FAILED',
          errorCode: 'EXTENSION_INPUT_HASH_MISMATCH',
        }
      } else {
        try {
          completion = completionFromResult(event.completionToken, await this.options.execute(event))
        } catch {
          completion = {
            completionToken: event.completionToken,
            status: 'FAILED',
            errorCode: 'PROVIDER_EXECUTION_FAILED',
          }
        }
      }
      this.pendingCompletion.set(event.runId, completion)
    }
    await this.options.complete(event.runId, completion)
    this.pendingCompletion.delete(event.runId)
    this.completed.add(event.runId)
    if (this.completed.size > 2_000) {
      const oldest = this.completed.values().next().value as string | undefined
      if (oldest) this.completed.delete(oldest)
    }
  }
}
