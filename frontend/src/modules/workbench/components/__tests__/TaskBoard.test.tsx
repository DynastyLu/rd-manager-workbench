import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TaskBoard } from '../TaskBoard'

const task = {
  id: 'task-1',
  projectId: null,
  milestoneId: null,
  parentId: null,
  title: '整理评审材料',
  description: null,
  assigneeName: null,
  collaboratorNames: [],
  status: 'TODO' as const,
  priority: 'MEDIUM' as const,
  dueAt: null,
  completedAt: null,
  sourceType: null,
  sourceId: null,
  archivedAt: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}

describe('TaskBoard', () => {
  it('shows empty status columns and requests the next status for a task', async () => {
    const onStatusChange = vi.fn()
    const user = userEvent.setup()

    render(
      <TaskBoard
        tasks={[task, { ...task, id: 'task-2', title: '已取消事项', status: 'CANCELLED' }]}
        onStatusChange={onStatusChange}
        isUpdating={false}
      />
    )

    expect(screen.getByRole('heading', { name: '待开始' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '已完成' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '已取消' })).toBeInTheDocument()
    expect(screen.getByText('整理评审材料')).toBeInTheDocument()
    expect(screen.getByText('已取消事项')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开始任务：整理评审材料' }))

    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'IN_PROGRESS')
  })

  it('exposes every supported status through an accessible status control', async () => {
    const user = userEvent.setup()

    render(<TaskBoard tasks={[task]} onStatusChange={vi.fn()} isUpdating={false} />)

    await user.click(screen.getByRole('combobox', { name: '设置任务状态：整理评审材料' }))
    for (const label of ['待开始', '进行中', '受阻', '已完成', '已取消']) {
      expect(await screen.findByRole('option', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })
})
