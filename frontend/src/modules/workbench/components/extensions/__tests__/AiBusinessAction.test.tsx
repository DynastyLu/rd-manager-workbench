import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AiBusinessAction } from '../AiBusinessAction'

const api = vi.hoisted(() => ({
  adoptAiResult: vi.fn(),
  completeExtensionRun: vi.fn(),
  listExtensionProfiles: vi.fn(),
  prepareAiRequest: vi.fn(),
  startExtensionRun: vi.fn(),
}))

vi.mock('@/modules/workbench/api/extensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/workbench/api/extensions')>()),
  ...api,
}))

function renderAction() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiBusinessAction
        operation="AI_SUMMARIZE_MEETING"
        objectId="meeting-1"
        objectLabel="项目周会"
        buttonLabel="AI 生成纪要"
        adoptLabel="采纳到会议纪要"
      />
    </QueryClientProvider>,
  )
}

describe('AiBusinessAction', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset()
    api.listExtensionProfiles.mockResolvedValue([{
      id: 'ai-1', kind: 'AI', provider: 'OPENAI_RESPONSES', name: 'AI 助手', enabled: true,
      publicConfig: { model: 'gpt-5-mini' }, credentialRef: 'credential:ai:1', credentialConfigured: true,
      permissions: ['AI_SUMMARIZE_MEETING'], createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
    }])
    api.prepareAiRequest.mockResolvedValue({
      operation: 'AI_SUMMARIZE_MEETING', inputSha256: 'a'.repeat(64), inputBytes: 200,
      confirmationHash: 'b'.repeat(64), requiresConfirmation: true, dataLeavesDevice: true,
      provider: 'OPENAI_RESPONSES',
      payload: { objectIds: ['meeting-1'], citationIds: ['meeting:meeting-1'], context: '会议正文' },
      disclosure: { providerReceives: ['meeting title', 'minutes'], objectIds: ['meeting-1'], characterCount: 88, truncated: false },
    })
    api.startExtensionRun.mockResolvedValue({ id: 'run-1', status: 'RUNNING', completionToken: 'once' })
    api.completeExtensionRun.mockResolvedValue({ id: 'run-1', status: 'SUCCEEDED' })
    api.adoptAiResult.mockResolvedValue({ id: 'meeting-1' })
    window.rdWorkbenchDesktop = {
      onNotificationClicked: () => () => undefined,
      extensions: {
        execute: vi.fn().mockResolvedValue({
          status: 'SUCCEEDED',
          output: { answer: '本周完成联调。', summary: '本周完成联调。', citations: ['meeting:meeting-1'], actionItems: [] },
          metadata: { model: 'gpt-5-mini' },
        }),
      },
    }
  })

  it('prepares, asks consent, executes and only adopts after explicit review', async () => {
    const user = userEvent.setup()
    renderAction()

    await user.click(await screen.findByRole('button', { name: 'AI 生成纪要' }))
    expect(await screen.findByText('确认发送给 AI')).toBeInTheDocument()
    expect(screen.getByText(/88 个字符/)).toBeInTheDocument()
    expect(api.startExtensionRun).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '确认发送' }))
    expect(await screen.findByText('本周完成联调。')).toBeInTheDocument()
    expect(api.adoptAiResult).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '采纳到会议纪要' }))
    await waitFor(() => expect(api.adoptAiResult).toHaveBeenCalledWith({
      runId: 'run-1',
      operation: 'AI_SUMMARIZE_MEETING', objectId: 'meeting-1',
      citationIds: ['meeting:meeting-1'],
      output: { answer: '本周完成联调。', summary: '本周完成联调。', citations: ['meeting:meeting-1'], actionItems: [] },
    }))
    expect(api.completeExtensionRun).toHaveBeenCalledWith('run-1', expect.objectContaining({
      completionToken: 'once', status: 'SUCCEEDED',
    }))
  })

  it('keeps the entry visible but clearly disabled in browser mode', async () => {
    window.rdWorkbenchDesktop = undefined
    renderAction()

    expect(await screen.findByRole('button', { name: 'AI 生成纪要' })).toBeDisabled()
    expect(screen.getByText('请在 Electron 桌面端使用 AI')).toBeInTheDocument()
  })
})
