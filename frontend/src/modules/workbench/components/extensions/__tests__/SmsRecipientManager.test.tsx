import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SmsRecipientManager } from '../SmsRecipientManager'

const api = vi.hoisted(() => ({
  archiveSmsRecipient: vi.fn(),
  createSmsRecipient: vi.fn(),
  listSmsRecipients: vi.fn(),
  updateSmsRecipient: vi.fn(),
}))

vi.mock('@/modules/workbench/api/extensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/workbench/api/extensions')>()),
  ...api,
}))

function renderManager() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <SmsRecipientManager />
    </QueryClientProvider>,
  )
}

describe('SmsRecipientManager', () => {
  const put = vi.fn()
  const deleteCredential = vi.fn()

  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset()
    put.mockReset()
    deleteCredential.mockReset()
    api.listSmsRecipients.mockResolvedValue([{
      id: 'recipient-1', label: '本人', maskedPhone: '138****8000',
      credentialRef: 'credential:sms-recipient:old', enabled: true,
      createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
    }])
    api.createSmsRecipient.mockResolvedValue({ id: 'recipient-2' })
    api.updateSmsRecipient.mockResolvedValue({ id: 'recipient-1' })
    api.archiveSmsRecipient.mockResolvedValue(undefined)
    window.rdWorkbenchDesktop = {
      onNotificationClicked: () => () => undefined,
      credentials: {
        isAvailable: vi.fn().mockResolvedValue(true), put,
        has: vi.fn().mockResolvedValue(true), delete: deleteCredential,
      },
    }
  })

  it('stores the full phone only in the encrypted vault and sends only a mask and ref to the backend', async () => {
    const user = userEvent.setup()
    renderManager()

    await user.click(await screen.findByRole('button', { name: '添加短信收件人' }))
    await user.type(screen.getByLabelText('收件人名称'), '面试提醒手机')
    await user.type(screen.getByLabelText('手机号码'), '+8613800138000')
    await user.click(screen.getByRole('button', { name: '保存收件人' }))

    await waitFor(() => expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^credential:sms-recipient:/),
      { phoneNumber: '+8613800138000' },
    ))
    expect(api.createSmsRecipient).toHaveBeenCalledWith({
      label: '面试提醒手机', maskedPhone: '+8613********8000',
      credentialRef: expect.stringMatching(/^credential:sms-recipient:/), enabled: true,
    })
    expect(JSON.stringify(api.createSmsRecipient.mock.calls)).not.toContain('+8613800138000')
  })

  it('edits metadata, toggles delivery and archives without revealing the phone', async () => {
    const user = userEvent.setup()
    renderManager()

    expect(await screen.findByText('138****8000')).toBeInTheDocument()
    expect(screen.queryByText('13800138000')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '编辑收件人：本人' }))
    await user.clear(screen.getByLabelText('收件人名称'))
    await user.type(screen.getByLabelText('收件人名称'), '本人手机')
    await user.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(api.updateSmsRecipient).toHaveBeenCalledWith('recipient-1', { label: '本人手机' }))

    await user.click(screen.getByRole('button', { name: '停用收件人：本人' }))
    await waitFor(() => expect(api.updateSmsRecipient).toHaveBeenCalledWith('recipient-1', { enabled: false }))
    await user.click(screen.getByRole('button', { name: '归档收件人：本人' }))
    await waitFor(() => expect(api.archiveSmsRecipient).toHaveBeenCalledWith('recipient-1'))
    expect(deleteCredential).toHaveBeenCalledWith('credential:sms-recipient:old')
  })

  it('disables full-phone saving in browser mode and explains why', async () => {
    window.rdWorkbenchDesktop = undefined
    renderManager()

    expect(await screen.findByRole('button', { name: '添加短信收件人' })).toBeDisabled()
    expect(screen.getByText('真实手机号只能在 Electron 加密保险箱中保存')).toBeInTheDocument()
  })

  it('rolls the database reference back and removes the new secret when old-secret cleanup fails during rotation', async () => {
    const user = userEvent.setup()
    deleteCredential.mockImplementation(async (ref: string) => {
      if (ref === 'credential:sms-recipient:old') throw new Error('VAULT_DELETE_FAILED')
    })
    renderManager()

    await user.click(await screen.findByRole('button', { name: '编辑收件人：本人' }))
    await user.type(screen.getByLabelText('手机号码'), '13900139000')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => expect(api.updateSmsRecipient).toHaveBeenCalledTimes(2))
    const nextRef = api.updateSmsRecipient.mock.calls[0]?.[1]?.credentialRef as string
    expect(api.updateSmsRecipient).toHaveBeenNthCalledWith(2, 'recipient-1', {
      label: '本人', maskedPhone: '138****8000',
      credentialRef: 'credential:sms-recipient:old', enabled: true,
    })
    expect(deleteCredential).toHaveBeenCalledWith(nextRef)
  })

  it('disables a recipient before deleting its vault secret and only then archives the row', async () => {
    const user = userEvent.setup()
    renderManager()

    await user.click(await screen.findByRole('button', { name: '归档收件人：本人' }))

    await waitFor(() => expect(api.archiveSmsRecipient).toHaveBeenCalledWith('recipient-1'))
    expect(api.updateSmsRecipient).toHaveBeenCalledWith('recipient-1', { enabled: false })
    expect(api.updateSmsRecipient.mock.invocationCallOrder[0]).toBeLessThan(deleteCredential.mock.invocationCallOrder[0]!)
    expect(deleteCredential.mock.invocationCallOrder[0]).toBeLessThan(api.archiveSmsRecipient.mock.invocationCallOrder[0]!)
  })
})
