import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TasksPage from '../TasksPage'
import type { MyWorkView } from '@/modules/workbench/api/tasks'

const {
  listMyWork,
  getTask,
  createTask,
  updateTask,
  setTaskLater,
  removeTaskLater,
  setTaskReminder,
  removeTaskReminder,
} = vi.hoisted(() => ({
  listMyWork: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskLater: vi.fn(),
  removeTaskLater: vi.fn(),
  setTaskReminder: vi.fn(),
  removeTaskReminder: vi.fn(),
}))

vi.mock('@/modules/workbench/api/tasks', () => ({
  listMyWork,
  getTask,
  createTask,
  updateTask,
  setTaskLater,
  removeTaskLater,
  setTaskReminder,
  removeTaskReminder,
}))

function renderTasksPage(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  path = '/my-work',
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <TasksPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

const task = {
  id: 'task-1',
  projectId: null,
  milestoneId: null,
  parentId: null,
  title: '整理评审材料',
  description: null,
  assigneeName: '李工',
  collaboratorNames: [],
  status: 'TODO' as const,
  priority: 'HIGH' as const,
  dueAt: '2026-07-20T01:00:00.000Z',
  completedAt: null,
  sourceType: null,
  sourceId: null,
  archivedAt: null,
  reminder: null,
  later: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}

const VIEW_TOTALS: Record<MyWorkView, number> = {
  INBOX: 3,
  TODAY: 2,
  WEEK: 5,
  OVERDUE: 1,
  LATER: 4,
  COMPLETED: 8,
}

function mockViews(overrides: Partial<Record<MyWorkView, typeof task[]>> = {}) {
  listMyWork.mockImplementation(({ view }: { view: MyWorkView }) =>
    Promise.resolve({
      data: overrides[view] ?? (view === 'INBOX' ? [task] : []),
      meta: { page: 1, pageSize: 100, total: VIEW_TOTALS[view] },
    }),
  )
}

describe('TasksPage', () => {
  beforeEach(() => {
    listMyWork.mockReset()
    getTask.mockReset()
    createTask.mockReset()
    updateTask.mockReset()
    setTaskLater.mockReset()
    removeTaskLater.mockReset()
    setTaskReminder.mockReset()
    removeTaskReminder.mockReset()
  })

  it('shows the six fixed views with counts returned by each API response', async () => {
    mockViews({ TODAY: [{ ...task, id: 'today-task', title: '准备今天的评审' }] })
    const user = userEvent.setup()

    renderTasksPage()

    expect(await screen.findByText('整理评审材料')).toBeInTheDocument()
    const views = screen.getByRole('navigation', { name: '我的工作视图' })
    for (const [name, count] of [
      ['收件箱', 3],
      ['今日', 2],
      ['本周', 5],
      ['逾期', 1],
      ['稍后处理', 4],
      ['已完成', 8],
    ] as const) {
      expect(within(views).getByRole('button', { name: new RegExp(`${name}.*${count}`) })).toBeInTheDocument()
    }
    await user.click(within(views).getByRole('button', { name: /今日.*2/ }))
    expect(await screen.findByText('准备今天的评审')).toBeInTheDocument()
    expect(screen.queryByText('整理评审材料')).not.toBeInTheDocument()
  })

  it('keeps project context in every fixed view query', async () => {
    mockViews()

    renderTasksPage(undefined, '/my-work?projectId=project-1')

    await waitFor(() => expect(listMyWork).toHaveBeenCalledTimes(6))
    for (const view of Object.keys(VIEW_TOTALS) as MyWorkView[]) {
      expect(listMyWork).toHaveBeenCalledWith({ view, projectId: 'project-1' })
    }
    expect(screen.getByText('当前仅显示本项目任务')).toBeInTheDocument()
  })

  it('opens the exact task supplied by a source deep link even when it is outside the fixed views', async () => {
    mockViews()
    getTask.mockResolvedValue({
      ...task,
      id: 'future-task',
      title: '下月技术评审',
      dueAt: '2026-08-20T01:00:00.000Z',
    })

    renderTasksPage(undefined, '/my-work?taskId=future-task')

    expect(await screen.findByRole('region', { name: '当前定位任务' })).toHaveTextContent('下月技术评审')
    expect(getTask).toHaveBeenCalledWith('future-task')
  })

  it('renders loading, retryable error and empty states for the active view', async () => {
    let resolveInbox: ((value: unknown) => void) | undefined
    listMyWork.mockImplementation(({ view }: { view: MyWorkView }) => {
      if (view === 'INBOX') {
        return new Promise((resolve) => {
          resolveInbox = resolve
        })
      }
      return Promise.resolve({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })
    })

    const firstRender = renderTasksPage()
    expect(screen.getByLabelText('正在加载我的工作')).toBeInTheDocument()
    firstRender.unmount()

    listMyWork.mockImplementation(({ view }: { view: MyWorkView }) =>
      view === 'INBOX'
        ? Promise.reject(new Error('离线'))
        : Promise.resolve({ data: [], meta: { page: 1, pageSize: 100, total: 0 } }),
    )
    const user = userEvent.setup()
    const secondRender = renderTasksPage()
    expect(await screen.findByText('无法读取我的工作')).toBeInTheDocument()

    listMyWork.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('收件箱里没有待处理任务')).toBeInTheDocument()
    secondRender.unmount()
    resolveInbox?.({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })
  })

  it('completes and cancels tasks through the real task update API', async () => {
    mockViews()
    updateTask.mockResolvedValue(task)
    const user = userEvent.setup()

    renderTasksPage()

    await user.click(await screen.findByRole('button', { name: '完成任务：整理评审材料' }))
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task-1', { status: 'DONE' }))

    await user.click(screen.getByRole('button', { name: '更多操作：整理评审材料' }))
    await user.click(await screen.findByRole('menuitem', { name: '取消任务' }))
    expect(updateTask).not.toHaveBeenCalledWith('task-1', { status: 'CANCELLED' })
    await user.click(screen.getByRole('button', { name: 'confirm' }))
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task-1', { status: 'CANCELLED' }))
  })

  it('does not expose scheduling or cancellation actions for completed tasks', async () => {
    mockViews({
      COMPLETED: [
        {
          ...task,
          id: 'done-task',
          title: '已经完成的任务',
          status: 'DONE',
          completedAt: task.updatedAt,
        },
      ],
    })
    const user = userEvent.setup()

    renderTasksPage()
    await user.click(await screen.findByRole('button', { name: /已完成.*8/ }))

    expect(await screen.findByText('已经完成的任务')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '稍后处理：已经完成的任务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设置提醒：已经完成的任务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '更多操作：已经完成的任务' })).not.toBeInTheDocument()
  })

  it('defers a task to a date and restores an existing deferred task', async () => {
    const deferredTask = {
      ...task,
      id: 'later-task',
      title: '稍后整理实验记录',
      later: {
        id: 'later-1',
        taskId: 'later-task',
        deferredUntil: '2026-07-25T00:00:00.000Z',
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    }
    mockViews({ INBOX: [task, deferredTask] })
    setTaskLater.mockResolvedValue({ taskId: 'task-1', deferredUntil: '2026-07-28T00:00:00+08:00' })
    removeTaskLater.mockResolvedValue(undefined)
    const user = userEvent.setup()

    renderTasksPage()

    await user.click(await screen.findByRole('button', { name: '稍后处理：整理评审材料' }))
    fireEvent.change(screen.getByLabelText('恢复日期'), { target: { value: '2026-07-28' } })
    await user.click(screen.getByRole('button', { name: '确认稍后处理' }))
    await waitFor(() =>
      expect(setTaskLater).toHaveBeenCalledWith('task-1', {
        deferredUntil: '2026-07-28T00:00:00+08:00',
      }),
    )

    await user.click(screen.getByRole('button', { name: '恢复任务：稍后整理实验记录' }))
    await waitFor(() => expect(removeTaskLater).toHaveBeenCalledWith('later-task'))
  })

  it('sets and clears a task reminder', async () => {
    const remindedTask = {
      ...task,
      id: 'reminded-task',
      title: '已提醒任务',
      reminder: {
        id: 'reminder-1',
        taskId: 'reminded-task',
        remindAt: '2026-07-20T01:00:00.000Z',
        dismissedAt: null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    }
    mockViews({ INBOX: [task, remindedTask] })
    setTaskReminder.mockResolvedValue({ taskId: 'task-1', remindAt: '2026-07-21T01:30:00.000Z' })
    removeTaskReminder.mockResolvedValue(undefined)
    const user = userEvent.setup()

    renderTasksPage()

    await user.click(await screen.findByRole('button', { name: '设置提醒：整理评审材料' }))
    fireEvent.change(screen.getByLabelText('提醒时间'), {
      target: { value: '2026-07-21T09:30' },
    })
    await user.click(screen.getByRole('button', { name: '保存提醒' }))
    await waitFor(() =>
      expect(setTaskReminder).toHaveBeenCalledWith('task-1', {
        remindAt: new Date('2026-07-21T09:30').toISOString(),
      }),
    )

    await user.click(screen.getByRole('button', { name: '清除提醒：已提醒任务' }))
    await waitFor(() => expect(removeTaskReminder).toHaveBeenCalledWith('reminded-task'))
  })

  it('changes a due date and creates a task in the current project', async () => {
    mockViews()
    updateTask.mockResolvedValue(task)
    createTask.mockResolvedValue({ ...task, projectId: 'project-1' })
    const user = userEvent.setup()

    renderTasksPage(undefined, '/my-work?projectId=project-1')

    await user.click(await screen.findByRole('button', { name: '更多操作：整理评审材料' }))
    await user.click(await screen.findByRole('menuitem', { name: '延期 / 修改截止日期' }))
    fireEvent.change(screen.getByLabelText('新的截止日期'), { target: { value: '2026-07-30' } })
    await user.click(screen.getByRole('button', { name: '保存截止日期' }))
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task-1', { dueAt: '2026-07-30' }))

    await user.click(screen.getByRole('button', { name: '新建任务' }))
    await user.type(screen.getByLabelText('任务名称'), ' 项目任务 ')
    await user.click(screen.getByRole('button', { name: '保存任务' }))
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith({
        title: '项目任务',
        projectId: 'project-1',
        completionPercent: 0,
      }),
    )
  })
})
