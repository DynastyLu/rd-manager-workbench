import type { ProviderRegistry } from '../provider-registry.js'
import { aliyunSms } from './aliyun-sms.js'
import { calDav } from './caldav.js'
import { localManualAi, localPreviewSms } from './local-providers.js'
import { openAiResponses } from './openai-responses.js'
import { webDav } from './webdav.js'

export function registerBuiltinProviders(registry: ProviderRegistry): ProviderRegistry {
  registry.register('LOCAL_PREVIEW', ['TEST_CONNECTION', 'SMS_PREVIEW'], localPreviewSms)
  registry.register('ALIYUN_SMS', ['TEST_CONNECTION', 'SMS_SEND'], aliyunSms)
  registry.register(
    'LOCAL_MANUAL',
    ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
    localManualAi,
  )
  registry.register(
    'OPENAI_RESPONSES',
    ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
    openAiResponses,
  )
  registry.register(
    'CALDAV',
    ['TEST_CONNECTION', 'CALENDAR_SYNC_PREFLIGHT', 'CALENDAR_SYNC_COMMIT'],
    calDav,
  )
  registry.register(
    'WEBDAV',
    ['TEST_CONNECTION', 'CLOUD_UPLOAD_PREFLIGHT', 'CLOUD_UPLOAD_COMMIT', 'CLOUD_DOWNLOAD_PREFLIGHT', 'CLOUD_DOWNLOAD_COMMIT'],
    webDav,
  )
  return registry
}
