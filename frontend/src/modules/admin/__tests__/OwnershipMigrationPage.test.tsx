import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminLayout from '@/modules/admin/AdminLayout'

const adminApi = vi.hoisted(() => ({
  analyzeOwnershipMigration: vi.fn(),
  applyOwnershipMigration: vi.fn(),
  bulkAssignOwnership: vi.fn(),
  completeOwnershipMigration: vi.fn(),
  getOwnershipMigrationStatus: vi.fn(),
  listUnresolvedOwnership: vi.fn(),
  listUsers: vi.fn(),
}))

vi.mock('@/modules/admin/api', () => ({
  ...adminApi,
  listAssignableEmployees: vi.fn(),
}))

describe('OwnershipMigrationPage', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/ownership-migration']}>
          <Routes>
            <Route path="/admin/*" element={<AdminLayout />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    queryClient.clear()
    Object.values(adminApi).forEach((mock) => mock.mockReset())

    adminApi.getOwnershipMigrationStatus.mockResolvedValue({
      startedAt: '2026-07-30T08:00:00.000Z',
      lastAnalyzedAt: '2026-07-30T08:05:00.000Z',
      lastAppliedAt: null,
      completedAt: null,
      total: 12,
      assigned: 10,
      needsReview: 2,
      isComplete: false,
    })

    adminApi.listUnresolvedOwnership.mockResolvedValue({
      cursor: null,
      items: [
        {
          id: 'Project:proj-1',
          module: 'projects',
          recordType: 'Project',
          recordId: 'proj-1',
          title: 'Legacy project',
          legacyOwner: 'legacy-owner',
          confidence: 'AMBIGUOUS',
          suggestedUser: { id: 'admin-1', username: 'admin', displayName: '管理员' },
        },
        {
          id: 'Project:proj-2',
          module: 'projects',
          recordType: 'Project',
          recordId: 'proj-2',
          title: 'Missing owner project',
          legacyOwner: '',
          confidence: 'MISSING',
          suggestedUser: { id: 'admin-1', username: 'admin', displayName: '管理员' },
        },
      ],
    })

    adminApi.listUsers.mockResolvedValue({
      data: [
        {
          id: 'user-1',
          username: 'zhangsan',
          employeeNo: 'RD-001',
          status: 'ACTIVE',
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          passwordChangedAt: null,
          lastLoginAt: null,
          permissionVersion: 1,
          resourceProfileId: 'profile-1',
          resourceProfile: {
            id: 'profile-1',
            displayName: '张三',
            department: '研发部',
            roleTitle: '工程师',
            employmentStatus: 'ACTIVE',
            archivedAt: null,
          },
          roles: [],
          createdAt: '2026-07-01T08:00:00.000Z',
          updatedAt: '2026-07-30T08:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 1000, total: 1 },
    })
  })

  it('renders status and unresolved records', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/待修正/)).toBeInTheDocument()
    })

    expect(screen.getByText(/总计 12/)).toBeInTheDocument()
    expect(screen.getByText(/Legacy project/)).toBeInTheDocument()
    expect(screen.getByText(/Missing owner project/)).toBeInTheDocument()
  })

  it('runs analysis and refreshes status', async () => {
    adminApi.analyzeOwnershipMigration.mockResolvedValue({ cursor: null, items: [] })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText(/Legacy project/)).toBeInTheDocument())

    const analyzeButton = screen.getByRole('button', { name: /分析归属/ })
    await user.click(analyzeButton)

    await waitFor(() => {
      expect(adminApi.analyzeOwnershipMigration).toHaveBeenCalled()
    })
  })

  it('applies assignments', async () => {
    adminApi.applyOwnershipMigration.mockResolvedValue({ appliedCount: 12, unresolvedCount: 0 })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText(/Legacy project/)).toBeInTheDocument())

    const applyButton = screen.getByRole('button', { name: /应用归属分配/ })
    await user.click(applyButton)

    await waitFor(() => {
      expect(adminApi.applyOwnershipMigration).toHaveBeenCalled()
    })
  })

  it('bulk assigns selected records to a user', async () => {
    adminApi.bulkAssignOwnership.mockResolvedValue({ updatedCount: 2 })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText(/Legacy project/)).toBeInTheDocument())

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]
    const checkbox = within(firstDataRow).getByRole('checkbox')
    await user.click(checkbox)

    const userSelect = screen.getByRole('combobox')
    fireEvent.click(userSelect)
    await waitFor(() => expect(userSelect.getAttribute('aria-expanded')).toBe('true'))
    const listboxId = userSelect.getAttribute('aria-controls')
    const listbox = document.getElementById(listboxId!)
    const option = within(listbox!).getByText('张三 (zhangsan)')
    fireEvent.click(option)
    await waitFor(() => expect(userSelect.getAttribute('aria-expanded')).toBe('false'))

    const bulkButton = screen.getByRole('button', { name: /批量分配/ })
    await user.click(bulkButton)

    await waitFor(() => {
      expect(adminApi.bulkAssignOwnership).toHaveBeenCalledWith([
        {
          recordType: 'Project',
          recordId: 'proj-1',
          ownerUserId: 'user-1',
        },
      ])
    })
  })

  it('disables complete button while unresolved records remain', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText(/Legacy project/)).toBeInTheDocument())

    const completeButton = screen.getByRole('button', { name: /完成迁移/ })
    expect(completeButton).toBeDisabled()
  })
})
