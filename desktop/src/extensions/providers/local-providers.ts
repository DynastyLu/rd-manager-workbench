import type { ExtensionExecutionInput, ExtensionExecutionResult } from '../contracts.js'

type Credential = Record<string, unknown> | undefined

export async function localPreviewSms(
  input: ExtensionExecutionInput,
  _credential: Credential,
): Promise<ExtensionExecutionResult> {
  void _credential
  if (input.operation !== 'SMS_PREVIEW' && input.operation !== 'TEST_CONNECTION') {
    return { status: 'REJECTED', errorCode: 'EXTENSION_OPERATION_UNSUPPORTED' }
  }
  return {
    status: 'REJECTED',
    errorCode: 'PREVIEW_ONLY',
    metadata: {
      preview: true,
      templateKey: typeof input.payload['templateKey'] === 'string' ? input.payload['templateKey'] : undefined,
      recipientMask: typeof input.payload['recipientMask'] === 'string' ? input.payload['recipientMask'] : undefined,
    },
  }
}

export async function localManualAi(
  input: ExtensionExecutionInput,
  _credential: Credential,
): Promise<ExtensionExecutionResult> {
  void _credential
  if (input.operation === 'TEST_CONNECTION') {
    return { status: 'REJECTED', errorCode: 'MANUAL_ONLY', metadata: { manual: true } }
  }
  if (!input.operation.startsWith('AI_')) {
    return { status: 'REJECTED', errorCode: 'EXTENSION_OPERATION_UNSUPPORTED' }
  }
  const output = input.payload['manualOutput']
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return { status: 'REJECTED', errorCode: 'MANUAL_INPUT_REQUIRED', metadata: { manual: true } }
  }
  const value = output as Record<string, unknown>
  const citations = Array.isArray(value['citations'])
    ? value['citations'].filter((item): item is string => typeof item === 'string')
    : []
  const allowed = new Set(
    Array.isArray(input.payload['citationIds'])
      ? input.payload['citationIds'].filter((item): item is string => typeof item === 'string')
      : [],
  )
  if (typeof value['answer'] !== 'string' || citations.some((citation) => !allowed.has(citation))) {
    return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' }
  }
  return {
    status: 'SUCCEEDED',
    output: {
      answer: value['answer'],
      citations,
      ...(typeof value['summary'] === 'string' ? { summary: value['summary'] } : {}),
      ...(Array.isArray(value['actionItems']) ? { actionItems: value['actionItems'] } : {}),
    },
    metadata: { manual: true, citationIds: citations },
  }
}
