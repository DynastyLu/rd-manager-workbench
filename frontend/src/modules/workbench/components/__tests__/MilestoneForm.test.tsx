import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MilestoneForm } from '../MilestoneForm'

vi.mock('@/modules/workbench/api/projects', () => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
}))

describe('MilestoneForm', () => {
  it('shows a plan range and explains task-derived completion', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MilestoneForm
          projectId="project-1"
          milestone={{
            id: 'milestone-1',
            projectId: 'project-1',
            name: '样机验证',
            plannedAt: null,
            plannedStartAt: '2026-07-01T00:00:00.000Z',
            plannedEndAt: '2026-08-01T00:00:00.000Z',
            actualAt: null,
            ownerName: null,
            isCritical: true,
            status: 'IN_PROGRESS',
            weightPercent: null,
            manualCompletionPercent: null,
            completionPercent: 68,
            completionSource: 'TASKS',
            effectiveWeightPercent: 100,
            linkedTaskCount: 6,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-28T00:00:00.000Z',
          }}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('计划时间')).toBeInTheDocument()
    expect(screen.getByText('当前进度由 6 个工作项自动计算')).toBeInTheDocument()
    expect(screen.queryByLabelText('手工完成进度')).not.toBeInTheDocument()
  })
})
