import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import WorkbenchHome from '../WorkbenchHome'

const { getDashboard } = vi.hoisted(() => ({ getDashboard: vi.fn() }))

vi.mock('@/modules/workbench/api/dashboard', () => ({ getDashboard }))

vi.mock('@/components/dashboard/ReactECharts', () => ({
  ReactECharts: function MockReactECharts() {
    return <div data-testid="react-echarts" />
  },
}))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkbenchHome />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('WorkbenchHome', () => {
  beforeEach(() => {
    getDashboard.mockReset()
  })

  it('shows the dashboard header, KPI cards, quick apps and widgets with empty states', async () => {
    getDashboard.mockResolvedValue({
      todayActions: [],
      overdueTasks: [],
      dueSoonMilestones: [],
      healthDistribution: { GREEN: 0, YELLOW: 0, RED: 0 },
      projectsNeedingAttention: [],
      recentProgressReports: [],
    })

    renderHome()

    expect(screen.getByRole('heading', { name: '研发主管工作台' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '常用应用' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '项目健康度' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '任务状态分布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日行动' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '逾期任务' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '临近里程碑' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '需关注项目' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最近进展汇报' })).toBeInTheDocument()
    expect(screen.getByText('今日没有待办行动。')).toBeInTheDocument()
    expect(screen.getByText('当前没有逾期任务。')).toBeInTheDocument()
    expect(screen.getByText('当前没有临近的里程碑。')).toBeInTheDocument()
    expect(screen.getByText('当前没有需特别关注的项目。')).toBeInTheDocument()
    expect(screen.getByText('最近没有进展汇报。')).toBeInTheDocument()
  })

  it('renders returned dashboard records without inventing values', async () => {
    getDashboard.mockResolvedValue({
      todayActions: [
        {
          id: 'task-1',
          projectId: 'project-1',
          milestoneId: null,
          parentId: null,
          title: '完成实验记录',
          description: null,
          assigneeName: '李工',
          collaboratorNames: [],
          status: 'TODO',
          priority: 'HIGH',
          dueAt: '2026-07-18T00:00:00.000Z',
          completedAt: null,
          sourceType: null,
          sourceId: null,
          archivedAt: null,
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:00:00.000Z',
        },
      ],
      overdueTasks: [],
      dueSoonMilestones: [],
      healthDistribution: { GREEN: 1, YELLOW: 2, RED: 3 },
      projectsNeedingAttention: [],
      recentProgressReports: [],
    })

    renderHome()

    expect(await screen.findByText('完成实验记录')).toBeInTheDocument()
    expect(screen.getByText('负责人：李工')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })
})
