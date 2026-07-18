import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RisksPage from '../RisksPage'

const { createRisk, listRisks } = vi.hoisted(() => ({
  createRisk: vi.fn(),
  listRisks: vi.fn(),
}))

vi.mock('@/modules/workbench/api/management', () => ({ createRisk, listRisks }))

function renderRisksPage(path = '/governance/risks') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <RisksPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RisksPage project context', () => {
  beforeEach(() => {
    createRisk.mockReset()
    listRisks.mockReset()
    listRisks.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
  })

  it('filters risks by the project supplied in the URL and explains the active scope', async () => {
    renderRisksPage('/governance/risks?projectId=project-42')

    await waitFor(() => {
      expect(listRisks).toHaveBeenCalledWith({ projectId: 'project-42', status: undefined })
    })
    expect(screen.getByText('当前仅显示本项目风险')).toBeInTheDocument()
  })

  it('assigns a newly created risk to the project supplied in the URL', async () => {
    createRisk.mockResolvedValue({ id: 'risk-1', projectId: 'project-42' })
    const user = userEvent.setup()

    renderRisksPage('/governance/risks?projectId=project-42')

    await user.click(screen.getByRole('button', { name: '新建风险' }))
    await user.type(screen.getByPlaceholderText('风险标题'), '供应链延期')
    await user.click(screen.getByRole('button', { name: '保存风险' }))

    await waitFor(() => {
      expect(createRisk).toHaveBeenCalledWith({
        title: '供应链延期',
        likelihood: 'HIGH',
        impact: 'HIGH',
        level: 'HIGH',
        ownerName: undefined,
        projectId: 'project-42',
      })
    })
  })
})
