import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
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
    localStorage.clear()
  })

  it('shows a readable empty state when no projects exist', async () => {
    listProjects.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })

    renderProjectsPage()

    expect(screen.getByRole('heading', { name: '项目' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '最近访问' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '全部项目' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: '搜索项目' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '项目状态' })).toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: '打开项目空间：耐盐材料筛选' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-1/overview'
    )
  })

  it('requests explicit pages and exposes server-side pagination from meta.total', async () => {
    const firstPageProject = {
      id: 'project-1',
      code: 'RD-001',
      name: '第一页项目',
      leadName: null,
      plannedEndAt: null,
      status: 'ACTIVE' as const,
      health: 'GREEN' as const,
    }
    const secondPageProject = {
      ...firstPageProject,
      id: 'project-21',
      code: 'RD-021',
      name: '第二页项目',
    }
    listProjects.mockImplementation(({ page }: { page?: number }) =>
      Promise.resolve({
        data: [page === 2 ? secondPageProject : firstPageProject],
        meta: { page: page ?? 1, pageSize: 20, total: 21 },
      })
    )
    const user = userEvent.setup()

    renderProjectsPage()

    expect(await screen.findByText('第一页项目')).toBeInTheDocument()
    expect(listProjects).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      search: undefined,
      status: undefined,
    })
    await user.click(screen.getByText('2'))

    expect(await screen.findByText('第二页项目')).toBeInTheDocument()
    expect(listProjects).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      search: undefined,
      status: undefined,
    })
  })

  it('loads a dedicated project set before resolving recent localStorage records', async () => {
    localStorage.setItem('rd-workbench:recent-projects', JSON.stringify(['project-25']))
    const recentProject = {
      id: 'project-25',
      code: 'RD-025',
      name: '跨页最近项目',
      leadName: null,
      plannedEndAt: null,
      status: 'ACTIVE' as const,
      health: 'GREEN' as const,
    }
    listProjects.mockImplementation(({ pageSize }: { pageSize?: number }) =>
      Promise.resolve({
        data: pageSize === 100 ? [recentProject] : [],
        meta: { page: 1, pageSize: pageSize ?? 20, total: 25 },
      })
    )
    const user = userEvent.setup()

    renderProjectsPage()
    await waitFor(() =>
      expect(listProjects).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 20 }))
    )
    await user.click(screen.getByRole('tab', { name: '最近访问' }))

    expect(await screen.findByText('跨页最近项目')).toBeInTheDocument()
    expect(listProjects).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      search: undefined,
      status: undefined,
    })
  })

  it('includes search in paginated list requests', async () => {
    listProjects.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })

    renderProjectsPage()
    await waitFor(() => expect(listProjects).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox', { name: '搜索项目' }), {
      target: { value: 'Alpha' },
    })

    await waitFor(() =>
      expect(listProjects).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        search: 'Alpha',
        status: undefined,
      })
    )
  })

  it('does not render an empty table when the project request fails', async () => {
    listProjects.mockRejectedValue(new Error('offline'))

    renderProjectsPage()

    expect(await screen.findByText('无法读取项目列表')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('还没有项目，先新建一个项目吧。')).not.toBeInTheDocument()
  })
})
