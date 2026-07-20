import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ExtensionsSettingsPage from '../ExtensionsSettingsPage'

const api = vi.hoisted(() => ({
  archiveExtensionProfile: vi.fn(),
  archiveSmsRecipient: vi.fn(),
  completeExtensionRun: vi.fn(),
  createExtensionProfile: vi.fn(),
  createSmsRecipient: vi.fn(),
  listExtensionProfiles: vi.fn(),
  listExtensionRuns: vi.fn(),
  listSmsRecipients: vi.fn(),
  prepareExtensionRun: vi.fn(),
  startExtensionRun: vi.fn(),
  updateExtensionProfile: vi.fn(),
  updateSmsRecipient: vi.fn(),
}))

vi.mock('@/modules/workbench/api/extensions', () => api)

const profiles = [
  {
    id: 'sms-1', kind: 'SMS', provider: 'LOCAL_PREVIEW', name: '短信本地预览', enabled: true,
    publicConfig: { templateMapping: {} }, credentialRef: null, permissions: ['TEST_CONNECTION', 'SMS_PREVIEW'],
    credentialConfigured: false, createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  },
  {
    id: 'ai-1', kind: 'AI', provider: 'OPENAI_RESPONSES', name: 'OpenAI 摘要', enabled: true,
    publicConfig: { model: 'gpt-5-mini' }, credentialRef: 'credential:ai-1', permissions: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING'],
    credentialConfigured: true, createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  },
  {
    id: 'calendar-1', kind: 'CALENDAR', provider: 'CALDAV', name: '工作日历', enabled: true,
    publicConfig: { baseUrl: 'https://calendar.example.com', calendarPath: '/team', syncDirection: 'PULL_ONLY' }, credentialRef: 'credential:calendar-1', permissions: ['TEST_CONNECTION'],
    credentialConfigured: true, createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  },
  {
    id: 'drive-1', kind: 'CLOUD_DRIVE', provider: 'WEBDAV', name: '资料云盘', enabled: false,
    publicConfig: { baseUrl: 'https://drive.example.com', remoteRoot: '/rd-workbench' }, credentialRef: 'credential:drive-1', permissions: ['TEST_CONNECTION'],
    credentialConfigured: true, createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ExtensionsSettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ExtensionsSettingsPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.listExtensionProfiles.mockResolvedValue(profiles)
    api.listExtensionRuns.mockResolvedValue([
      {
        id: 'run-1', profileId: 'ai-1', operation: 'TEST_CONNECTION', status: 'FAILED',
        inputSha256: 'a'.repeat(64), inputBytes: 42, outputSha256: null, outputBytes: null,
        errorCode: 'PROVIDER_TIMEOUT', metadata: { recipient: '13800138000', providerMessageId: 'msg-1' },
        createdAt: '2026-07-20T01:00:00.000Z', startedAt: '2026-07-20T01:00:00.000Z', finishedAt: '2026-07-20T01:00:20.000Z',
      },
    ])
    api.listSmsRecipients.mockResolvedValue([{
      id: 'recipient-1', label: '本人', maskedPhone: '138****8000',
      credentialRef: 'credential:sms-recipient:1', enabled: true,
      createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
    }])
    window.rdWorkbenchDesktop = undefined
  })

  it('organizes SMS, AI, calendar and cloud drive settings with a clear browser fallback', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: '外部能力' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '短信通知' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'AI 助手' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '外部日历' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '云盘' })).toBeInTheDocument()
    expect(await screen.findByText('短信本地预览')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '短信收件人' })).toBeInTheDocument()
    expect(await screen.findByText('138****8000')).toBeInTheDocument()
    expect(screen.getByText('浏览器模式不能安全保存或使用外部服务凭据')).toBeInTheDocument()
  })

  it('requires an explicit real outbound confirmation before a connection test', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'SUCCEEDED', metadata: { latencyMs: 120 } })
    window.rdWorkbenchDesktop = {
      onNotificationClicked: () => () => undefined,
      credentials: {
        isAvailable: vi.fn().mockResolvedValue(true),
        put: vi.fn(), has: vi.fn().mockResolvedValue(true), delete: vi.fn(),
      },
      extensions: { execute },
    }
    api.prepareExtensionRun.mockResolvedValue({
      operation: 'TEST_CONNECTION', inputSha256: 'a'.repeat(64), inputBytes: 2,
      confirmationHash: 'b'.repeat(64), requiresConfirmation: true, dataLeavesDevice: true,
      provider: 'OPENAI_RESPONSES',
    })
    api.startExtensionRun.mockResolvedValue({
      id: 'run-2', profileId: 'ai-1', operation: 'TEST_CONNECTION', status: 'RUNNING',
      inputSha256: 'a'.repeat(64), inputBytes: 2, completionToken: 'once-only',
    })
    api.completeExtensionRun.mockResolvedValue({ id: 'run-2', status: 'SUCCEEDED' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'AI 助手' }))
    await user.click(await screen.findByRole('button', { name: '测试 OpenAI 摘要 连接' }))

    expect(screen.getByRole('dialog', { name: '确认真实外呼' })).toBeInTheDocument()
    expect(screen.getByText('测试会真实外呼')).toBeInTheDocument()
    expect(api.startExtensionRun).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认并测试' }))

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(api.startExtensionRun).toHaveBeenCalledWith('ai-1', {
      operation: 'TEST_CONNECTION', payload: {}, confirmationHash: 'b'.repeat(64),
    })
    expect(api.completeExtensionRun).toHaveBeenCalledWith('run-2', expect.objectContaining({
      completionToken: 'once-only', status: 'SUCCEEDED',
    }))
  })

  it('shows only hashes, byte counts and sanitized run metadata', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'AI 助手' }))
    await user.click(await screen.findByRole('button', { name: '查看运行历史' }))

    expect(await screen.findByRole('dialog', { name: '运行历史' })).toBeInTheDocument()
    expect(screen.getByText('PROVIDER_TIMEOUT')).toBeInTheDocument()
    expect(screen.getByText('42 B')).toBeInTheDocument()
    expect(screen.queryByText('13800138000')).not.toBeInTheDocument()
    expect(screen.getByText(/运行日志不保存短信正文、手机号或 AI 输入输出正文/)).toBeInTheDocument()
  })

  it('disables a provider, removes its vault secret, then archives it in that safe order', async () => {
    const deleteCredential = vi.fn().mockResolvedValue(undefined)
    window.rdWorkbenchDesktop = {
      onNotificationClicked: () => () => undefined,
      credentials: {
        isAvailable: vi.fn().mockResolvedValue(true), put: vi.fn(),
        has: vi.fn().mockResolvedValue(true), delete: deleteCredential,
      },
    }
    api.updateExtensionProfile.mockResolvedValue({ ...profiles[1], enabled: false })
    api.archiveExtensionProfile.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'AI 助手' }))
    await user.click(await screen.findByRole('button', { name: '停用并归档' }))

    await waitFor(() => expect(api.archiveExtensionProfile).toHaveBeenCalled())
    expect(api.archiveExtensionProfile.mock.calls[0]?.[0]).toBe('ai-1')
    expect(api.updateExtensionProfile).toHaveBeenCalledWith('ai-1', { enabled: false })
    expect(deleteCredential).toHaveBeenCalledWith('credential:ai-1')
    expect(api.updateExtensionProfile.mock.invocationCallOrder[0]).toBeLessThan(deleteCredential.mock.invocationCallOrder[0]!)
    expect(deleteCredential.mock.invocationCallOrder[0]).toBeLessThan(api.archiveExtensionProfile.mock.invocationCallOrder[0]!)
  })
})
