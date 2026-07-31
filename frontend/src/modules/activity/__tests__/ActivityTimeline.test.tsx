import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'
import { ActivityTimeline } from '../components/ActivityTimeline'

const activityApi = vi.hoisted(() => ({
  listActivities: vi.fn(),
}))

vi.mock('../api', () => activityApi)

function renderTimeline() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ActivityTimeline projectId="project-1" />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ActivityTimeline', () => {
  beforeEach(() => {
    activityApi.listActivities.mockReset()
    activityApi.listActivities.mockResolvedValue({
      data: [
        {
          id: 'activity-2',
          actorKind: 'AUTOMATION',
          actorId: null,
          actorName: null,
          objectType: 'PROJECT_PROGRESS_DRAFT',
          objectId: 'draft-1',
          projectId: 'project-1',
          employeeId: null,
          action: 'ADOPTED',
          summary: '已采纳员工周报项目进展草稿',
          sourcePath: '/projects/project-1?tab=progress',
          metadata: null,
          occurredAt: '2026-07-29T08:00:00.000Z',
        },
        {
          id: 'activity-1',
          actorKind: 'HUMAN',
          actorId: null,
          actorName: '李工',
          objectType: 'WORK_TASK',
          objectId: 'task-1',
          projectId: 'project-1',
          employeeId: null,
          action: 'UPDATED',
          summary: '更新工作项：完成联调',
          sourcePath: '/my-work?taskId=task-1',
          metadata: null,
          occurredAt: '2026-07-29T07:00:00.000Z',
        },
      ],
      nextCursor: null,
    })
  })

  it('distinguishes automatic and manual events and links back to source objects', async () => {
    renderTimeline()

    expect(await screen.findByText('已采纳员工周报项目进展草稿')).toBeInTheDocument()
    expect(screen.getByText('自动操作')).toBeInTheDocument()
    expect(screen.getByText('李工')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '查看原对象' })[0]).toHaveAttribute(
      'href',
      '/projects/project-1?tab=progress'
    )
  })

  it('passes type, source, and time filters to the activity query', async () => {
    renderTimeline()
    await screen.findByText('更新工作项：完成联调')
    await selectSemiOption(screen.getByLabelText('类型'), 'WORK_TASK')
    await selectSemiOption(screen.getByLabelText('来源'), 'HUMAN')
    await selectSemiOption(screen.getByLabelText('时间'), '30')

    await waitFor(() =>
      expect(activityApi.listActivities).toHaveBeenLastCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          objectType: 'WORK_TASK',
          actorKind: 'HUMAN',
          from: expect.any(String),
        })
      )
    )
  })
})
