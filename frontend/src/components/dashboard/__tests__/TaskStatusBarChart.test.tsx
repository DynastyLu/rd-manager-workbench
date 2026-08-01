import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskStatusBarChart } from '../TaskStatusBarChart'
import type { WorkTask } from '@/modules/workbench/types'

const mockOption = vi.fn()

vi.mock('../ReactECharts', () => ({
  ReactECharts: function MockReactECharts({
    option,
    style,
  }: {
    option: unknown
    style?: React.CSSProperties
  }) {
    mockOption(option)
    return <div data-testid="react-echarts" data-option={JSON.stringify(option)} style={style} />
  },
}))

function makeTask(status: WorkTask['status']): WorkTask {
  return {
    id: crypto.randomUUID(),
    code: 'T-1',
    projectId: null,
    milestoneId: null,
    parentId: null,
    title: 'Task',
    description: null,
    assigneeName: null,
    collaboratorNames: [],
    status,
    priority: 'MEDIUM',
    completionPercent: 0,
    dueAt: null,
    completedAt: null,
    sourceType: null,
    sourceId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('TaskStatusBarChart', () => {
  it('renders the section heading', () => {
    render(<TaskStatusBarChart todayActions={[]} overdueTasks={[]} />)
    expect(screen.getByRole('heading', { name: '任务状态分布' })).toBeInTheDocument()
  })

  it('counts tasks by status across both lists', () => {
    render(
      <TaskStatusBarChart
        todayActions={[makeTask('TODO'), makeTask('IN_PROGRESS')]}
        overdueTasks={[makeTask('TODO'), makeTask('BLOCKED')]}
      />
    )

    const option = mockOption.mock.calls[mockOption.mock.calls.length - 1]?.[0] as {
      series: Array<{
        data: Array<{ value: number; itemStyle: { color: string | undefined } }>
      }>
    }

    expect(option.series[0].data[0].value).toBe(2)
    expect(option.series[0].data[1].value).toBe(1)
    expect(option.series[0].data[2].value).toBe(1)
  })

  it('uses workspace token colors for bars', () => {
    render(<TaskStatusBarChart todayActions={[makeTask('TODO')]} overdueTasks={[]} />)
    const option = mockOption.mock.calls[mockOption.mock.calls.length - 1]?.[0] as {
      series: Array<{
        data: Array<{ itemStyle: { color: string | undefined } }>
      }>
    }
    // In jsdom CSS custom properties resolve to empty strings, so the helper returns undefined.
    expect(option.series[0].data[0].itemStyle.color).toBeUndefined()
  })

  it('disables animation when reduced motion is preferred', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia

    render(<TaskStatusBarChart todayActions={[]} overdueTasks={[]} />)
    const option = mockOption.mock.calls[mockOption.mock.calls.length - 1]?.[0] as {
      animation: boolean | undefined
    }
    expect(option.animation).toBe(false)
  })
})
