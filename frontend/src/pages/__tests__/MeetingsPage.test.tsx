import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MeetingsPage from '../MeetingsPage'

const { createMeeting, listMeetings } = vi.hoisted(() => ({
  createMeeting: vi.fn(),
  listMeetings: vi.fn(),
}))

vi.mock('@/modules/workbench/api/management', () => ({ createMeeting, listMeetings }))

function renderMeetingsPage(path = '/meetings') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <MeetingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MeetingsPage project context', () => {
  beforeEach(() => {
    createMeeting.mockReset()
    listMeetings.mockReset()
    listMeetings.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
  })

  it('filters meetings by the project supplied in the URL and explains the active scope', async () => {
    renderMeetingsPage('/meetings?projectId=project-42')

    await waitFor(() => {
      expect(listMeetings).toHaveBeenCalledWith({ projectId: 'project-42' })
    })
    expect(screen.getByText('当前仅显示本项目会议')).toBeInTheDocument()
  })

  it('assigns a newly created meeting to the project supplied in the URL', async () => {
    createMeeting.mockResolvedValue({ id: 'meeting-1', projectId: 'project-42' })
    const user = userEvent.setup()

    renderMeetingsPage('/meetings?projectId=project-42')

    await user.click(screen.getByRole('button', { name: '新建会议' }))
    await user.type(screen.getByPlaceholderText('会议标题'), '项目周会')
    fireEvent.change(screen.getByDisplayValue(''), {
      target: { value: '2026-07-20T09:30' },
    })
    await user.click(screen.getByRole('button', { name: '保存会议' }))

    await waitFor(() => {
      expect(createMeeting).toHaveBeenCalledWith({
        title: '项目周会',
        scheduledAt: new Date('2026-07-20T09:30').toISOString(),
        projectId: 'project-42',
      })
    })
  })
})
