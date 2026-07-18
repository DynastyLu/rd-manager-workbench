import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DecisionsPage from '../DecisionsPage'

const { createDecision, getDecision, listDecisions } = vi.hoisted(() => ({
  createDecision: vi.fn(),
  getDecision: vi.fn(),
  listDecisions: vi.fn(),
}))

vi.mock('@/modules/workbench/api/management', () => ({
  createDecision,
  getDecision,
  listDecisions,
}))

describe('DecisionsPage source deep link', () => {
  beforeEach(() => {
    createDecision.mockReset()
    getDecision.mockReset()
    listDecisions.mockReset()
    listDecisions.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
  })

  it('opens the exact decision supplied by a source deep link', async () => {
    getDecision.mockResolvedValue({
      id: 'decision-7',
      title: '采用 PostgreSQL',
      status: 'DECIDED',
      alternatives: ['PostgreSQL', 'SQLite'],
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/library/governance/decisions?recordId=decision-7']}>
          <DecisionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('region', { name: '当前定位决策' })).toHaveTextContent('采用 PostgreSQL')
    expect(getDecision).toHaveBeenCalledWith('decision-7')
  })
})
