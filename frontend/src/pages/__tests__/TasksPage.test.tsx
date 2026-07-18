import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TasksPage from '../TasksPage'

const { listTasks, createTask, updateTask } = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
}))

vi.mock('@/modules/workbench/api/tasks', () => ({ listTasks, createTask, updateTask }))

function renderTasksPage(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  path = '/my-work'
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <TasksPage />
        </MemoryRouter>
      </QueryClientProvider>
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
  dueAt: '2026-07-20',
  completedAt: null,
  sourceType: null,
  sourceId: null,
  archivedAt: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}

describe('TasksPage', () => {
  beforeEach(() => {
    listTasks.mockReset()
    createTask.mockReset()
    updateTask.mockReset()
  })

  it('groups queried tasks into accessible status columns', async () => {
    listTasks.mockResolvedValue({
      data: [task, { ...task, id: 'task-2', title: '确认风险应对', status: 'BLOCKED' }],
      meta: { page: 1, pageSize: 20, total: 2 },
    })

    renderTasksPage()

    expect(screen.getByRole('heading', { name: '任务' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '待开始' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '进行中' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '受阻' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '已完成' })).toBeInTheDocument()
    expect(screen.getByText('整理评审材料')).toBeInTheDocument()
    expect(screen.getByText('确认风险应对')).toBeInTheDocument()
  })

  it('shows a retryable error state and an empty state', async () => {
    listTasks.mockRejectedValueOnce(new Error('离线')).mockResolvedValueOnce({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })
    const user = userEvent.setup()

    renderTasksPage()

    expect(await screen.findByText('无法读取任务列表')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('还没有任务，先新建一个任务吧。')).toBeInTheDocument()
  })

  it('creates a task and refreshes dependent task views', async () => {
    listTasks.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
    createTask.mockResolvedValue(task)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()

    renderTasksPage(queryClient)

    await user.click(await screen.findByRole('button', { name: '新建任务' }))
    await user.type(screen.getByLabelText('任务名称'), ' 整理评审材料 ')
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: '整理评审材料' })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] })
    })
  })

  it('updates a task status and refreshes dependent task views', async () => {
    listTasks.mockResolvedValue({ data: [task], meta: { page: 1, pageSize: 20, total: 1 } })
    updateTask.mockResolvedValue({ ...task, status: 'IN_PROGRESS' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()

    renderTasksPage(queryClient)

    await user.click(await screen.findByRole('button', { name: '开始任务：整理评审材料' }))

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('task-1', { status: 'IN_PROGRESS' })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] })
    })
  })

  it('sends explicit blocked, cancelled and reopened statuses to the API', async () => {
    listTasks.mockResolvedValue({
      data: [
        { ...task, id: 'task-block', title: '需要受阻', status: 'TODO' },
        { ...task, id: 'task-cancel', title: '需要取消', status: 'IN_PROGRESS' },
        { ...task, id: 'task-reopen', title: '需要重开', status: 'CANCELLED' },
      ],
      meta: { page: 1, pageSize: 20, total: 3 },
    })
    updateTask.mockResolvedValue(task)

    renderTasksPage()

    fireEvent.keyDown(await screen.findByRole('combobox', { name: '设置任务状态：需要受阻' }), {
      key: 'ArrowDown',
    })
    fireEvent.click(screen.getByRole('option', { name: '受阻' }))
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task-block', { status: 'BLOCKED' }))

    fireEvent.keyDown(screen.getByRole('combobox', { name: '设置任务状态：需要取消' }), {
      key: 'ArrowDown',
    })
    fireEvent.click(screen.getByRole('option', { name: '已取消' }))
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task-cancel', { status: 'CANCELLED' }))

    fireEvent.keyDown(screen.getByRole('combobox', { name: '设置任务状态：需要重开' }), {
      key: 'ArrowDown',
    })
    fireEvent.click(screen.getByRole('option', { name: '待开始' }))
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task-reopen', { status: 'TODO' }))
  })

  it('filters and creates tasks in the project supplied by the workspace URL', async () => {
    listTasks.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
    createTask.mockResolvedValue({ ...task, id: 'project-task', projectId: 'project-1' })
    const user = userEvent.setup()

    renderTasksPage(undefined, '/my-work?projectId=project-1')

    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project-1' })
      )
    })
    expect(screen.getByText('当前仅显示本项目任务')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建任务' }))
    await user.type(screen.getByLabelText('任务名称'), '项目任务')
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: '项目任务', projectId: 'project-1' })
    })
  })
})
