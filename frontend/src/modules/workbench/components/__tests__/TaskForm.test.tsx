import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TaskForm } from '../TaskForm'
import { STATUS_OPTIONS } from '../task-form-options'

const { createTask, updateTask } = vi.hoisted(() => ({ createTask: vi.fn(), updateTask: vi.fn() }))

vi.mock('@/modules/workbench/api/tasks', () => ({ createTask, updateTask }))

describe('TaskForm', () => {
  it('creates a trimmed task and invalidates every task view', async () => {
    createTask.mockResolvedValue({ id: 'task-1' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <TaskForm />
      </QueryClientProvider>
    )

    await user.type(screen.getByLabelText('任务名称'), ' 整理评审材料 ')
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({ title: '整理评审材料', completionPercent: 0 })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-work'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] })
    })
  })

  it('offers cancelled as an explicit creation status', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <TaskForm />
      </QueryClientProvider>
    )

    expect(STATUS_OPTIONS).toContainEqual({ value: 'CANCELLED', label: '已取消' })
    expect(screen.getByRole('combobox', { name: '状态（可选）' })).toBeInTheDocument()
  })

  it('uses the workspace date and select controls instead of browser-native fields', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TaskForm />
      </QueryClientProvider>
    )

    expect(container.querySelector('input[type="date"]')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.semi-select')).toHaveLength(2)
    expect(container.querySelector('.semi-datepicker')).toHaveAttribute(
      'aria-labelledby',
      'task-due-at-label'
    )
  })

  it('keeps a task inside the project that opened the form', async () => {
    createTask.mockResolvedValue({ id: 'task-project-1' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <TaskForm projectId="project-1" />
      </QueryClientProvider>
    )

    await user.type(screen.getByLabelText('任务名称'), '项目任务')
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({
        title: '项目任务',
        projectId: 'project-1',
        completionPercent: 0,
      })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project', 'project-1'] })
    })
  })
})
