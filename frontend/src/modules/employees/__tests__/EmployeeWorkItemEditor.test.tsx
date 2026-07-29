import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmployeeWorkItemEditor } from '../components/EmployeeWorkItemEditor'
import type { EmployeeWorkItem } from '../types'

const item: EmployeeWorkItem = {
  id: 'work-1',
  employeeId: 'employee-1',
  employeeName: '张三',
  department: '研发部',
  importBatchId: 'batch-1',
  importVersion: 2,
  sourceRowId: 'row-1',
  sourceRowNumber: 1,
  sourceBatchIds: ['batch-1'],
  periodStart: '2026-07-27',
  periodEnd: '2026-08-02',
  title: '完成接口联调',
  workKind: 'NON_PROJECT',
  classificationState: 'CLASSIFIED',
  plannedCompletionDate: '2026-07-31',
  planText: null,
  summaryText: null,
  completionRate: 50,
  status: 'IN_PROGRESS',
  nextPlanText: null,
  riskText: '依赖测试环境',
  plannedHours: 16,
  actualHours: 8,
  project: null,
  task: null,
  riskId: null,
  note: null,
  links: {
    selfUrl: '/employee-work-items/work-1',
    employeeProgressUrl: '/employees/employee-1/progress',
    sourceBatchUrl: '/employee-work-imports/batch-1',
  },
}

describe('EmployeeWorkItemEditor', () => {
  it('submits the editable system fields without changing imported content', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <EmployeeWorkItemEditor
        item={item}
        projects={[]}
        tasks={[]}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.click(screen.getByRole('button', { name: '保存修改' }))

    expect(onSubmit).toHaveBeenCalledWith(item, {
      workKind: 'NON_PROJECT',
      projectId: null,
      taskId: null,
      plannedCompletionAt: '2026-07-31',
      plannedHours: 16,
      actualHours: 8,
      riskText: '依赖测试环境',
    })
  })
})
