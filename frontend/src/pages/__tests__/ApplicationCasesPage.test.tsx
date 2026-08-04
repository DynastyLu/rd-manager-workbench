import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ApplicationCasesPage from '../ApplicationCasesPage'

const { getApplicationCase, listApplicationCases, listWorkflowTemplates } = vi.hoisted(() => ({
  getApplicationCase: vi.fn(),
  listApplicationCases: vi.fn(),
  listWorkflowTemplates: vi.fn(),
}))

vi.mock('@/modules/workbench/api/applications', () => ({
  listApplicationCases,
  listWorkflowTemplates,
  getApplicationCase,
  createApplicationCase: vi.fn(),
  updateApplicationNode: vi.fn(),
}))

function renderPage(path = '/library/applications') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ApplicationCasesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ApplicationCasesPage', () => {
  beforeEach(() => {
    listApplicationCases.mockReset()
    listWorkflowTemplates.mockReset()
    getApplicationCase.mockReset()
    listWorkflowTemplates.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
  })

  it('shows an actionable empty state when no cases exist', async () => {
    listApplicationCases.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })

    renderPage()

    expect(await screen.findByText('还没有申报案件，先创建一个案件吧。')).toBeInTheDocument()
  })

  it('shows a retryable error when the case list cannot be loaded', async () => {
    listApplicationCases.mockRejectedValue(new Error('离线'))

    renderPage()

    expect(await screen.findByText('无法读取申报案件')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('opens the exact application case from a search deep link', async () => {
    listApplicationCases.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
    getApplicationCase.mockResolvedValue({
      id: 'case-1',
      code: 'APP-001',
      title: '高新技术企业认定',
      status: 'DRAFT',
      nodes: [],
      requirements: [],
      materials: [],
      evidenceRecords: [],
      corrections: [],
      submissions: [],
    })

    renderPage('/library/applications?caseId=case-1')

    expect(getApplicationCase).toHaveBeenCalledWith('case-1')
    expect(await screen.findByText('高新技术企业认定')).toBeInTheDocument()
  })
})
