import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DataGovernancePage from '../DataGovernancePage'

const api = vi.hoisted(() => ({
  createBackup: vi.fn(),
  createRestorePreflight: vi.fn(),
  deleteBackup: vi.fn(),
  getDataHealth: vi.fn(),
  getGovernanceSettings: vi.fn(),
  listAuditLogs: vi.fn(),
  listBackups: vi.fn(),
  updateGovernanceSettings: vi.fn(),
  verifyBackup: vi.fn(),
}))

vi.mock('@/modules/workbench/api/governance', () => api)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DataGovernancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DataGovernancePage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    window.rdWorkbenchDesktop = {
      onNotificationClicked: () => () => undefined,
      restoreBackup: vi.fn().mockResolvedValue(undefined),
    }
    api.getGovernanceSettings.mockResolvedValue({
      autoBackupEnabled: true,
      autoBackupTimeLocal: '02:00',
      retentionDays: 30,
      lastAutoBackupLocalDate: '2026-07-20',
    })
    api.listBackups.mockResolvedValue({
      data: [
        {
          id: 'backup-1',
          kind: 'MANUAL',
          status: 'VERIFIED',
          fileCount: 4,
          byteSize: 2048,
          createdAt: '2026-07-20T02:00:00.000Z',
          verifiedAt: '2026-07-20T02:02:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    api.getDataHealth.mockResolvedValue({
      status: 'HEALTHY',
      checkedAt: '2026-07-20T03:00:00.000Z',
      checks: [
        { key: 'database', label: 'PostgreSQL 与迁移', status: 'PASS', detail: '连接正常' },
        { key: 'storage', label: '本地文件目录', status: 'PASS', detail: '4 个文件可读取' },
      ],
    })
    api.listAuditLogs.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
  })

  it('presents backup, audit and health as one settings workspace', async () => {
    renderPage()

    expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '备份恢复' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '审计日志' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '健康检查' })).toBeInTheDocument()
    expect((await screen.findAllByText('PostgreSQL 与迁移')).length).toBeGreaterThan(0)
    expect(screen.getByText('最近备份已验证')).toBeInTheDocument()
  })

  it('creates a manual backup and refreshes its verified state', async () => {
    api.createBackup.mockResolvedValue({ id: 'backup-2', status: 'CREATED' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: '备份恢复' }))
    await user.click(await screen.findByRole('button', { name: '立即备份' }))

    await waitFor(() => expect(api.createBackup).toHaveBeenCalledTimes(1))
    expect(api.listBackups).toHaveBeenCalledTimes(2)
  })

  it('requires a preflight before exposing the restore confirmation', async () => {
    api.createRestorePreflight.mockResolvedValue({
      id: 'preflight-1',
      backupId: 'backup-1',
      manifestSha256: 'sha-1',
      confirmationToken: 'one-time-token',
      expiresAt: '2026-07-20T03:10:00.000Z',
      warnings: ['将覆盖当前数据库和附件'],
      summary: { fileCount: 4, byteSize: 2048 },
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: '备份恢复' }))
    await user.click(await screen.findByRole('button', { name: '恢复预检' }))

    expect(api.createRestorePreflight.mock.calls[0]?.[0]).toBe('backup-1')
    expect(await screen.findByRole('dialog', { name: '恢复本地工作台' })).toBeInTheDocument()
    expect(screen.getByText('将覆盖当前数据库和附件')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认恢复' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '输入确认文字' }), '恢复本地工作台')
    expect(screen.getByRole('button', { name: '确认恢复' })).toBeEnabled()
  })

  it('filters audit logs without displaying request values', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: '审计日志' }))
    await user.type(screen.getByRole('textbox', { name: '筛选对象类型' }), 'BACKUP')
    await user.click(screen.getByRole('button', { name: '查询审计' }))

    await waitFor(() =>
      expect(api.listAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ entityType: 'BACKUP' }),
      ),
    )
    expect(screen.getByText('审计只记录字段名，不保存正文、手机号或密钥。')).toBeInTheDocument()
  })
})
