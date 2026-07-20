import { afterEach, describe, expect, it, vi } from 'vitest'
import { aliyunSms } from './aliyun-sms.js'

describe('aliyunSms', () => {
  afterEach(() => vi.unstubAllGlobals())

  const input = {
    runId: 'run-1',
    profile: {
      id: 'profile-1', kind: 'SMS' as const, provider: 'ALIYUN_SMS' as const, enabled: true,
      publicConfig: { regionId: 'cn-hangzhou', signName: '研发工作台', templateMapping: { IMPORTANT_REMINDER: 'SMS_123' } },
    },
    operation: 'SMS_SEND' as const,
    payload: { templateKey: 'IMPORTANT_REMINDER', templateVariables: { title: '面试提醒' } },
  }

  it('uses SendSms 2017-05-25, retries transient HTTP and returns only masked metadata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Code: 'OK', Message: 'OK', BizId: 'biz-1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await aliyunSms(input, {
      accessKeyId: 'ak-id', accessKeySecret: 'ak-secret', recipient: { phoneNumber: '13800008000' },
    })
    expect(result).toMatchObject({ status: 'SUCCEEDED', metadata: { providerMessageId: 'biz-1' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = String(init.body)
    expect(body).toContain('Action=SendSms')
    expect(body).toContain('Version=2017-05-25')
    expect(body).toContain('TemplateCode=SMS_123')
    expect(JSON.stringify(result)).not.toContain('13800008000')
    expect(JSON.stringify(result)).not.toContain('ak-secret')
  })

  it('does not retry configuration/provider 4xx errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Code: 'isv.INVALID_PARAMETERS', Message: 'invalid' }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(aliyunSms(input, {
      accessKeyId: 'ak-id', accessKeySecret: 'ak-secret', recipient: { phoneNumber: '13800008000' },
    })).resolves.toMatchObject({ status: 'FAILED', errorCode: 'isv.INVALID_PARAMETERS', metadata: { retryable: false } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
