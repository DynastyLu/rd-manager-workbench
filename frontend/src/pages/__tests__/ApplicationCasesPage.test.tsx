import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ApplicationCasesPage from '../ApplicationCasesPage'

const { listApplicationCases, listWorkflowTemplates } = vi.hoisted(() => ({
  listApplicationCases: vi.fn(),
  listWorkflowTemplates: vi.fn(),
}))

vi.mock('@/modules/workbench/api/applications', () => ({
  listApplicationCases,
  listWorkflowTemplates,
  createApplicationCase: vi.fn(),
  updateApplicationNode: vi.fn(),
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApplicationCasesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ApplicationCasesPage', () => {
  beforeEach(() => {
    listApplicationCases.mockReset()
    listWorkflowTemplates.mockReset()
    listWorkflowTemplates.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
  })

  it('shows an actionable empty state when no cases exist', async () => {
    listApplicationCases.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })

    renderPage()

    expect(screen.getByRole('heading', { name: '申报认定' })).toBeInTheDocument()
    expect(await screen.findByText('还没有申报案件，先创建一个案件吧。')).toBeInTheDocument()
  })

  it('shows a retryable error when the case list cannot be loaded', async () => {
    listApplicationCases.mockRejectedValue(new Error('离线'))

    renderPage()

    expect(await screen.findByText('无法读取申报案件')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
