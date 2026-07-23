import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'

import MeetingsPage from '../MeetingsPage'

const {
  createDecision,
  createMeeting,
  createMeetingAction,
  createMeetingActionTask,
  createMeetingAgendaItem,
  createReminderRule,
  getMeeting,
  listReminderRules,
  listMeetings,
  updateMeetingAction,
  updateDocument,
} = vi.hoisted(() => ({
  createDecision: vi.fn(),
  createMeeting: vi.fn(),
  createMeetingAction: vi.fn(),
  createMeetingActionTask: vi.fn(),
  createMeetingAgendaItem: vi.fn(),
  createReminderRule: vi.fn(),
  getMeeting: vi.fn(),
  listReminderRules: vi.fn(),
  listMeetings: vi.fn(),
  updateMeetingAction: vi.fn(),
  updateDocument: vi.fn(),
}))

vi.mock('@/modules/workbench/api/management', () => ({
  createDecision,
  createMeeting,
  createMeetingAction,
  createMeetingActionTask,
  createMeetingAgendaItem,
  getMeeting,
  listMeetings,
  updateMeetingAction,
}))
vi.mock('@/modules/workbench/api/documents', () => ({ updateDocument }))
vi.mock('@/modules/workbench/api/notifications', () => ({
  archiveReminderRule: vi.fn(),
  createReminderRule,
  listReminderRules,
}))
vi.mock('@/modules/content/components/RichTextEditor', () => ({
  RichTextEditor: ({ onChange }: { onChange: (content: Record<string, unknown>, plainText: string) => void }) => (
    <>
      <button type="button" onClick={() => onChange({ type: 'doc', content: [{ text: '第一版' }] }, '更新后的纪要')}>
        模拟编辑纪要
      </button>
      <button type="button" onClick={() => onChange({ type: 'doc', content: [{ text: '第二版' }] }, '最新纪要')}>
        模拟再次编辑纪要
      </button>
    </>
  ),
}))
vi.mock('@/modules/content/components/FileAttachments', () => ({
  FileAttachments: ({ associations }: { associations: { meetingId?: string } }) => (
    <section aria-label="真实附件组件">会议附件 {associations.meetingId}</section>
  ),
}))
vi.mock('@/modules/workbench/components/extensions/AiBusinessAction', () => ({
  AiBusinessAction: ({ buttonLabel, objectId }: { buttonLabel: string; objectId?: string }) => (
    <button type="button" data-object-id={objectId}>{buttonLabel}</button>
  ),
}))

const meeting = {
  id: 'meeting-1',
  projectId: 'project-42',
  title: '项目周会',
  scheduledAt: '2026-07-20T01:30:00.000Z',
  heldAt: null,
  status: 'PLANNED',
  agenda: null,
  minutes: null,
  participantNames: ['张三', '李四'],
  archivedAt: null,
  agendaItems: [
    { id: 'agenda-1', meetingId: 'meeting-1', title: '版本风险', description: null, sequence: 1, archivedAt: null },
  ],
  actions: [
    {
      id: 'action-1',
      meetingId: 'meeting-1',
      title: '完成验收清单',
      description: null,
      ownerName: '张三',
      dueAt: '2026-07-22T09:00:00.000Z',
      status: 'OPEN',
      taskId: null,
      archivedAt: null,
      createdAt: '2026-07-19T01:00:00.000Z',
      updatedAt: '2026-07-19T01:00:00.000Z',
    },
  ],
  decisions: [
    {
      id: 'decision-1',
      projectId: 'project-42',
      milestoneId: null,
      taskId: null,
      meetingId: 'meeting-1',
      title: '发布日期保持不变',
      background: '范围已收敛',
      alternatives: [],
      basis: null,
      conclusion: '按原计划上线',
      participantNames: [],
      status: 'DECIDED',
      decidedAt: '2026-07-20T02:00:00.000Z',
      archivedAt: null,
      createdAt: '2026-07-19T01:00:00.000Z',
      updatedAt: '2026-07-19T01:00:00.000Z',
    },
  ],
  createdAt: '2026-07-19T01:00:00.000Z',
  updatedAt: '2026-07-19T01:00:00.000Z',
}

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
    createMeetingAction.mockReset()
    createMeetingActionTask.mockReset()
    createMeetingAgendaItem.mockReset()
    createDecision.mockReset()
    createReminderRule.mockReset()
    getMeeting.mockReset()
    updateMeetingAction.mockReset()
    updateDocument.mockReset()
    listMeetings.mockReset()
    listReminderRules.mockReset()
    listMeetings.mockResolvedValue({ data: [meeting], meta: { page: 1, pageSize: 20, total: 1 } })
    getMeeting.mockResolvedValue(meeting)
    listReminderRules.mockResolvedValue([])
  })

  it('filters meetings by the project supplied in the URL and explains the active scope', async () => {
    renderMeetingsPage('/meetings?projectId=project-42')

    await waitFor(() => {
      expect(listMeetings).toHaveBeenCalledWith({ page: 1, pageSize: 20, projectId: 'project-42' })
    })
    expect(screen.getByText('当前仅显示本项目会议')).toBeInTheDocument()
  })

  it('opens the meeting supplied in the URL and presents the six real work sections', async () => {
    renderMeetingsPage('/meetings?meetingId=meeting-1')

    await waitFor(() => expect(getMeeting).toHaveBeenCalledWith('meeting-1'))
    expect(await screen.findByText('项目周会', { selector: 'h2' })).toBeInTheDocument()
    for (const section of ['基本信息', '议程', '纪要', '行动项', '决策', '附件']) {
      expect(screen.getByRole('tab', { name: section })).toBeInTheDocument()
    }
  })

  it('offers an AI minutes draft inside the selected meeting and keeps adoption scoped to it', async () => {
    const user = userEvent.setup()
    renderMeetingsPage('/meetings?meetingId=meeting-1')

    await user.click(await screen.findByRole('tab', { name: '纪要' }))
    const action = screen.getByRole('button', { name: 'AI 生成纪要' })
    expect(action).toHaveAttribute('data-object-id', 'meeting-1')
  })

  it('creates agenda items and converts an action to a task without offering duplicate creation', async () => {
    createMeetingAgendaItem.mockResolvedValue({ id: 'agenda-2' })
    createMeetingActionTask.mockResolvedValue({
      task: { id: 'task-1', title: '完成验收清单' },
      alreadyExists: false,
    })
    const user = userEvent.setup()
    renderMeetingsPage('/meetings?meetingId=meeting-1')

    await user.click(await screen.findByRole('tab', { name: '议程' }))
    await user.type(screen.getByLabelText('议题标题'), '发布检查')
    await user.click(screen.getByRole('button', { name: '添加议题' }))
    await waitFor(() =>
      expect(createMeetingAgendaItem).toHaveBeenCalledWith('meeting-1', {
        title: '发布检查',
        sequence: 2,
      }),
    )

    await user.click(screen.getByRole('tab', { name: '行动项' }))
    await user.click(screen.getByRole('button', { name: '转为任务：完成验收清单' }))
    await waitFor(() =>
      expect(createMeetingActionTask).toHaveBeenCalledWith('action-1', {
        title: '完成验收清单',
        projectId: 'project-42',
        assigneeName: '张三',
        dueAt: '2026-07-22T09:00:00.000Z',
      }),
    )
  })

  it('filters by status and date range using the backend meeting query contract', async () => {
    renderMeetingsPage()

    await selectSemiOption(screen.getByLabelText('会议状态'), 'HELD')
    fireEvent.change(screen.getByLabelText('会议开始日期'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('会议结束日期'), { target: { value: '2026-07-31' } })

    await waitFor(() =>
      expect(listMeetings).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        status: 'HELD',
        startFrom: new Date('2026-07-01T00:00').toISOString(),
        startTo: new Date('2026-07-31T23:59:59.999').toISOString(),
      }),
    )
  })

  it('auto-saves rich meeting minutes and reuses the shared attachment component', async () => {
    getMeeting.mockResolvedValue({
      ...meeting,
      minutesDocument: {
        id: 'document-1',
        title: '项目周会 会议纪要',
        type: 'MEETING_MINUTES',
        content: { type: 'doc', content: [] },
        plainText: '',
      },
    })
    updateDocument.mockResolvedValue({ id: 'document-1' })
    const user = userEvent.setup()
    renderMeetingsPage('/meetings?meetingId=meeting-1')

    await user.click(await screen.findByRole('tab', { name: '纪要' }))
    await user.click(screen.getByRole('button', { name: '模拟编辑纪要' }))
    await waitFor(
      () =>
        expect(updateDocument).toHaveBeenCalledWith('document-1', {
          content: { type: 'doc', content: [{ text: '第一版' }] },
          plainText: '更新后的纪要',
        }),
      { timeout: 1500 },
    )

    await user.click(screen.getByRole('tab', { name: '附件' }))
    expect(screen.getByLabelText('真实附件组件')).toHaveTextContent('会议附件 meeting-1')
  })

  it('serializes meeting minute saves so an older request cannot overwrite the latest edit', async () => {
    getMeeting.mockResolvedValue({
      ...meeting,
      minutesDocument: {
        id: 'document-1',
        title: '项目周会 会议纪要',
        type: 'MEETING_MINUTES',
        content: { type: 'doc', content: [] },
        plainText: '',
      },
    })
    let resolveFirstSave!: (value: { id: string }) => void
    updateDocument
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstSave = resolve }))
      .mockResolvedValueOnce({ id: 'document-1' })
    const user = userEvent.setup()
    renderMeetingsPage('/meetings?meetingId=meeting-1')

    await user.click(await screen.findByRole('tab', { name: '纪要' }))
    await user.click(screen.getByRole('button', { name: '模拟编辑纪要' }))
    await waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(1), { timeout: 1500 })
    await user.click(screen.getByRole('button', { name: '模拟再次编辑纪要' }))
    await new Promise((resolve) => window.setTimeout(resolve, 600))
    expect(updateDocument).toHaveBeenCalledTimes(1)

    resolveFirstSave({ id: 'document-1' })
    await waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(2))
    expect(updateDocument).toHaveBeenLastCalledWith('document-1', {
      content: { type: 'doc', content: [{ text: '第二版' }] },
      plainText: '最新纪要',
    })
  })

  it('paginates meetings beyond the first twenty records', async () => {
    listMeetings.mockResolvedValue({
      data: [meeting],
      meta: { page: 1, pageSize: 20, total: 21 },
    })
    const user = userEvent.setup()
    renderMeetingsPage()

    await user.click(await screen.findByRole('button', { name: '下一页' }))

    await waitFor(() => expect(listMeetings).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }))
  })

  it('creates a meeting reminder and records a structured decision', async () => {
    createReminderRule.mockResolvedValue({ id: 'rule-1' })
    createDecision.mockResolvedValue({ id: 'decision-2' })
    const user = userEvent.setup()
    renderMeetingsPage('/meetings?meetingId=meeting-1')

    await user.click(await screen.findByRole('tab', { name: '基本信息' }))
    fireEvent.change(screen.getByLabelText('会议提醒时间'), {
      target: { value: '2026-07-20T09:00' },
    })
    await user.click(screen.getByRole('button', { name: '添加提醒' }))
    await waitFor(() =>
      expect(createReminderRule).toHaveBeenCalledWith({
        sourceType: 'MEETING',
        sourceId: 'meeting-1',
        remindAt: new Date('2026-07-20T09:00').toISOString(),
      }),
    )

    await user.click(screen.getByRole('tab', { name: '决策' }))
    await user.type(screen.getByLabelText('决策标题'), '发布日期保持不变')
    await user.type(screen.getByLabelText('决策背景'), '范围已经收敛')
    await user.type(screen.getByLabelText('决策结论'), '按原计划上线')
    await user.click(screen.getByRole('button', { name: '保存决策' }))
    await waitFor(() =>
      expect(createDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '发布日期保持不变',
          background: '范围已经收敛',
          conclusion: '按原计划上线',
          alternatives: [],
          meetingId: 'meeting-1',
          projectId: 'project-42',
          status: 'DECIDED',
        }),
      ),
    )
  })

  it('edits an existing meeting action before completion', async () => {
    updateMeetingAction.mockResolvedValue({ id: 'action-1' })
    const user = userEvent.setup()
    renderMeetingsPage('/meetings?meetingId=meeting-1')

    await user.click(await screen.findByRole('tab', { name: '行动项' }))
    await user.click(screen.getByRole('button', { name: '编辑：完成验收清单' }))
    await user.clear(screen.getByLabelText('编辑行动项负责人'))
    await user.type(screen.getByLabelText('编辑行动项负责人'), '李四')
    await user.click(screen.getByRole('button', { name: '保存行动项' }))

    await waitFor(() =>
      expect(updateMeetingAction).toHaveBeenCalledWith('meeting-1', 'action-1', {
        title: '完成验收清单',
        ownerName: '李四',
        dueAt: '2026-07-22T09:00:00.000Z',
        status: 'OPEN',
      }),
    )
  })

  it('assigns a newly created meeting to the project supplied in the URL', async () => {
    createMeeting.mockResolvedValue({ id: 'meeting-1', projectId: 'project-42' })
    const user = userEvent.setup()

    renderMeetingsPage('/meetings?projectId=project-42')

    await user.click(screen.getByRole('button', { name: '新建会议' }))
    await user.type(screen.getByPlaceholderText('会议标题'), '项目周会')
    fireEvent.change(screen.getByLabelText('会议开始时间'), {
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
