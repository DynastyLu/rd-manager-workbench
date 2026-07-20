import { createHmac, randomUUID } from 'node:crypto'
import type { ExtensionExecutionInput, ExtensionExecutionResult } from '../contracts.js'
import {
  isRetryableHttp,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_MS,
  responseTextLimited,
  retryDelay,
} from './provider-http.js'

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function signedParameters(input: {
  accessKeyId: string
  accessKeySecret: string
  phoneNumber: string
  signName: string
  templateCode: string
  templateVariables: Record<string, unknown>
}): URLSearchParams {
  const parameters: Record<string, string> = {
    AccessKeyId: input.accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: input.phoneNumber,
    RegionId: 'cn-hangzhou',
    SignName: input.signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: input.templateCode,
    TemplateParam: JSON.stringify(input.templateVariables),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  }
  const canonical = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&')
  const stringToSign = `POST&%2F&${percentEncode(canonical)}`
  parameters['Signature'] = createHmac('sha1', `${input.accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')
  return new URLSearchParams(parameters)
}

function credentialString(credential: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = credential?.[key]
  return typeof value === 'string' && value ? value : undefined
}

export async function aliyunSms(
  input: ExtensionExecutionInput,
  credential: Record<string, unknown> | undefined,
): Promise<ExtensionExecutionResult> {
  const accessKeyId = credentialString(credential, 'accessKeyId')
  const accessKeySecret = credentialString(credential, 'accessKeySecret')
  const recipient = credential?.['recipient']
  const phoneNumber = recipient && typeof recipient === 'object' && !Array.isArray(recipient)
    ? credentialString(recipient as Record<string, unknown>, 'phoneNumber')
    : undefined
  const config = input.profile.publicConfig
  const signName = typeof config['signName'] === 'string' ? config['signName'] : undefined
  const mapping = config['templateMapping']
  const templateKey = typeof input.payload['templateKey'] === 'string' ? input.payload['templateKey'] : undefined
  const templateCode = templateKey && mapping && typeof mapping === 'object' && !Array.isArray(mapping)
    ? (mapping as Record<string, unknown>)[templateKey]
    : undefined
  if (!accessKeyId || !accessKeySecret || !signName || typeof templateCode !== 'string') {
    return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
  }
  if (input.operation === 'TEST_CONNECTION') {
    return { status: 'REJECTED', errorCode: 'LIVE_SEND_REQUIRED_FOR_CONNECTION_TEST' }
  }
  if (input.operation !== 'SMS_SEND' || !phoneNumber) {
    return { status: 'REJECTED', errorCode: phoneNumber ? 'EXTENSION_OPERATION_UNSUPPORTED' : 'CREDENTIAL_NOT_FOUND' }
  }
  const templateVariables = input.payload['templateVariables']
  const variables = templateVariables && typeof templateVariables === 'object' && !Array.isArray(templateVariables)
    ? templateVariables as Record<string, unknown>
    : {}

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const body = signedParameters({ accessKeyId, accessKeySecret, phoneNumber, signName, templateCode, templateVariables: variables })
      const response = await fetch('https://dysmsapi.aliyuncs.com/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      })
      if (isRetryableHttp(response.status) && attempt < PROVIDER_MAX_ATTEMPTS) {
        await retryDelay(attempt)
        continue
      }
      const text = await responseTextLimited(response, 64 * 1024)
      let result: Record<string, unknown> = {}
      try { result = JSON.parse(text) as Record<string, unknown> } catch { /* normalized below */ }
      const code = typeof result['Code'] === 'string' ? result['Code'] : `HTTP_${response.status}`
      if (response.ok && code === 'OK') {
        return {
          status: 'SUCCEEDED',
          metadata: {
            providerMessageId: typeof result['BizId'] === 'string' ? result['BizId'] : undefined,
            retryable: false,
          },
        }
      }
      const retryable = isRetryableHttp(response.status) || code === 'isp.SYSTEM_ERROR'
      if (retryable && attempt < PROVIDER_MAX_ATTEMPTS) {
        await retryDelay(attempt)
        continue
      }
      return { status: 'FAILED', errorCode: code, metadata: { retryable: false } }
    } catch (error) {
      if (attempt < PROVIDER_MAX_ATTEMPTS) {
        await retryDelay(attempt)
        continue
      }
      return {
        status: 'FAILED',
        errorCode: error instanceof Error && error.message === 'EXTENSION_RESPONSE_TOO_LARGE'
          ? error.message
          : 'NETWORK_TIMEOUT',
        metadata: { retryable: false },
      }
    }
  }
  return { status: 'FAILED', errorCode: 'SMS_DELIVERY_FAILED', metadata: { retryable: false } }
}
