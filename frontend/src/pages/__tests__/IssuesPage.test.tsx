import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IssuesPage from '../IssuesPage'

const { createIssue, getIssue, listIssues } = vi.hoisted(() => ({
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  listIssues: vi.fn(),
}))

vi.mock('@/modules/workbench/api/management', () => ({ createIssue, getIssue, listIssues }))

describe('IssuesPage search deep link', () => {
  beforeEach(() => {
    listIssues.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
    getIssue.mockResolvedValue({
      id: 'issue-1',
      title: '关键器件阻塞',
      status: 'IN_PROGRESS',
      dueAt: null,
      ownerName: '王工',
    })
  })

  it('loads and highlights the exact recordId', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/library/governance/issues?recordId=issue-1']}>
          <IssuesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('region', { name: '当前定位问题' })).toHaveTextContent(
      '关键器件阻塞',
    )
    expect(getIssue).toHaveBeenCalledWith('issue-1')
  })
})
