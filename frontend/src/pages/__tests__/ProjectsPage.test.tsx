import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProjectsPage from '../ProjectsPage'

const { listProjects, createProject, updateProject } = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
}))

vi.mock('@/modules/workbench/api/projects', () => ({
  listProjects,
  createProject,
  updateProject,
}))

function renderProjectsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    listProjects.mockReset()
  })

  it('shows a readable empty state when no projects exist', async () => {
    listProjects.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })

    renderProjectsPage()

    expect(screen.getByRole('heading', { name: '项目' })).toBeInTheDocument()
    expect(await screen.findByText('还没有项目，先新建一个项目吧。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建项目' })).toBeInTheDocument()
  })

  it('shows project records with a textual health state', async () => {
    listProjects.mockResolvedValue({
      data: [
        {
          id: 'project-1',
          code: 'RD-001',
          name: '耐盐材料筛选',
          type: null,
          researchDirection: null,
          objective: null,
          expectedOutcome: null,
          leadName: '张工',
          participantNames: [],
          plannedStartAt: null,
          plannedEndAt: null,
          actualStartAt: null,
          actualEndAt: null,
          status: 'ACTIVE',
          phase: 'RESEARCH',
          health: 'YELLOW',
          archivedAt: null,
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    })

    renderProjectsPage()

    expect(await screen.findByText('耐盐材料筛选')).toBeInTheDocument()
    expect(screen.getByText('RD-001')).toBeInTheDocument()
    expect(screen.getByText('关注')).toBeInTheDocument()
  })
})
