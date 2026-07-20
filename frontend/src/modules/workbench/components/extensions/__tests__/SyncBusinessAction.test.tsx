import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncBusinessAction } from '../SyncBusinessAction'

const api = vi.hoisted(() => ({
  commitSyncSession: vi.fn(),
  getSyncSession: vi.fn(),
  listExtensionProfiles: vi.fn(),
  prepareSyncSession: vi.fn(),
  startSyncPreflight: vi.fn(),
}))

vi.mock('@/modules/workbench/api/extensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/workbench/api/extensions')>()),
  ...api,
}))

function renderAction() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SyncBusinessAction
        kind="CALENDAR"
        buttonLabel="外部日历同步"
        target={{ type: 'CALENDAR', startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-08-01T00:00:00.000Z' }}
        labels={{ 'event-1': '架构评审' }}
      />
    </QueryClientProvider>,
  )
}

describe('SyncBusinessAction', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset()
    api.listExtensionProfiles.mockResolvedValue([{
      id: 'calendar-1', kind: 'CALENDAR', provider: 'CALDAV', name: '工作日历', enabled: true,
      publicConfig: { syncDirection: 'BIDIRECTIONAL' }, credentialRef: 'credential:calendar:1', credentialConfigured: true,
      permissions: ['CALENDAR_SYNC_PREFLIGHT'], createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
    }])
    api.prepareSyncSession.mockResolvedValue({
      sessionId: 'session-1', operation: 'CALENDAR_SYNC_PREFLIGHT',
      inputSha256: 'a'.repeat(64), inputBytes: 120, confirmationHash: 'b'.repeat(64),
      requiresConfirmation: true, dataLeavesDevice: true, provider: 'CALDAV',
      summary: { type: 'CALENDAR', startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-08-01T00:00:00.000Z' },
    })
    api.startSyncPreflight.mockResolvedValue({ sessionId: 'session-1', runId: 'run-1', status: 'PREFLIGHT_RUNNING' })
    api.getSyncSession.mockResolvedValue({
      id: 'session-1', profileId: 'calendar-1', targetType: 'CALENDAR', status: 'READY',
      preflight: {
        direction: 'BIDIRECTIONAL', expiresAt: '2026-07-20T10:00:00.000Z', preflightHash: 'c'.repeat(64),
        items: [{
          itemKey: 'calendar:remote-1', localType: 'CALENDAR_EVENT', localId: 'event-1', remoteId: 'remote-1',
          action: 'CONFLICT', allowedResolutions: ['KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY'],
        }],
      },
      updatedAt: '2026-07-20T00:00:00.000Z',
    })
    api.commitSyncSession.mockResolvedValue({ sessionId: 'session-1', status: 'COMMITTED' })
    window.rdWorkbenchDesktop = {
      onNotificationClicked: () => () => undefined,
      extensions: { execute: vi.fn() },
    }
  })

  it('shows add/update/conflict preflight and commits explicit conflict choices', async () => {
    const user = userEvent.setup()
    renderAction()

    await user.click(await screen.findByRole('button', { name: '外部日历同步' }))
    expect(await screen.findByText('确认外部同步预检')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认并开始预检' }))
    expect(await screen.findByText('同步预检')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '架构评审：创建副本' }))
    await user.click(screen.getByRole('button', { name: '确认同步' }))

    await waitFor(() => expect(api.commitSyncSession).toHaveBeenCalledWith('session-1', expect.objectContaining({
      preflightHash: 'c'.repeat(64),
      resolutions: [{ itemKey: 'calendar:remote-1', resolution: 'CREATE_COPY' }],
    })))
  })

  it('clearly degrades in browser mode', async () => {
    window.rdWorkbenchDesktop = undefined
    renderAction()

    expect(await screen.findByRole('button', { name: '外部日历同步' })).toBeDisabled()
    expect(screen.getByText('请在 Electron 桌面端使用外部同步')).toBeInTheDocument()
  })
})
