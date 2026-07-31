import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { EmployeeWeekPlanTable } from '../components/EmployeeWeekPlanTable'
import { EmployeeWorkTable } from '../components/EmployeeWorkTable'
import type { EmployeeWeekPlan, EmployeeWorkItem } from '../types'

const source = {
  sheetName: '张明',
  section: 'NEXT_WEEK_PLAN' as const,
  rowNumber: 21,
  key: '张明:NEXT_WEEK_PLAN:21',
  label: '张明 / 下周计划 / 第 21 行',
}

const workItem = {
  id: 'work-1',
  employeeId: 'employee-1',
  employeeName: '张明',
  department: '研发一组',
  workDirection: '权限平台',
  importBatchId: 'batch-1',
  importVersion: 2,
  sourceRowId: 'row-1',
  sourceRowNumber: 7,
  sourceBatchIds: ['batch-1'],
  periodStart: '2026-07-20',
  periodEnd: '2026-07-26',
  title: '权限模型联调',
  workKind: 'PROJECT',
  classificationState: 'CLASSIFIED',
  plannedCompletionDate: '2026-07-24',
  overdue: true,
  source: { ...source, section: 'CURRENT_WORK', rowNumber: 7, label: '张明 / 本周工作 / 第 7 行' },
  planText: null,
  summaryText: '完成联调',
  completionRate: 80,
  status: 'AT_RISK',
  nextPlanText: null,
  riskText: '接口未冻结',
  plannedHours: 12,
  actualHours: 10,
  project: { id: 'project-1', code: 'RD-026', name: '权限平台' },
  task: null,
  riskId: null,
  note: null,
  links: {
    selfUrl: '/employee-work-items/work-1',
    employeeProgressUrl: '/employees/employee-1/progress',
    sourceBatchUrl: '/employee-work-imports/batch-1',
  },
} satisfies EmployeeWorkItem

const plan = {
  id: 'plan-1',
  employeeId: 'employee-1',
  employeeName: '张明',
  department: '研发一组',
  workDirection: '权限平台',
  importBatchId: 'batch-1',
  importVersion: 2,
  sourceRowId: 'row-21',
  sourceBatchIds: ['batch-1'],
  periodStart: '2026-07-27',
  periodEnd: '2026-08-02',
  title: '完成灰度发布',
  deliverableText: '发布记录与回滚方案',
  plannedCompletionDate: '2026-07-31',
  priority: 'URGENT',
  collaborationText: '需要测试组协作',
  planText: '先灰度再全量',
  note: '导入备注',
  workKind: 'PROJECT',
  carryStatus: 'PLANNED',
  matchedWorkItemId: null,
  cancelReason: null,
  project: { id: 'project-1', code: 'RD-026', name: '权限平台' },
  task: null,
  source,
  links: {
    selfUrl: '/employee-week-plans/plan-1',
    employeeProgressUrl: '/employees/employee-1/progress',
    projectProgressUrl: '/projects/project-1/team-progress',
    sourceBatchUrl: '/employee-work-imports/batch-1',
  },
} satisfies EmployeeWeekPlan

describe('employee weekly V2 tables', () => {
  it('shows current work classification, deadline, overdue state and exact source location', () => {
    const legacy = {
      ...workItem,
      id: 'work-legacy',
      title: '历史周报事项',
      workKind: null,
      classificationState: 'LEGACY_UNCLASSIFIED' as const,
      plannedCompletionDate: null,
      overdue: false,
      source: undefined,
    }

    const { container } = render(
      <MemoryRouter>
        <EmployeeWorkTable items={[workItem, legacy]} />
      </MemoryRouter>
    )

    expect(container.querySelector<HTMLElement>('.semi-table-body table')).toHaveStyle({
      width: '1396px',
    })
    const currentRow = screen.getByText('权限模型联调').closest('tr')
    expect(currentRow).not.toBeNull()
    expect(within(currentRow as HTMLElement).getByText('项目工作')).toBeInTheDocument()
    expect(within(currentRow as HTMLElement).getByText('2026-07-24')).toBeInTheDocument()
    expect(within(currentRow as HTMLElement).getByText('已逾期')).toBeInTheDocument()
    expect(within(currentRow as HTMLElement).getByText('张明 / 本周工作 / 第 7 行')).toBeInTheDocument()

    const legacyRow = screen.getByText('历史周报事项').closest('tr')
    expect(legacyRow).not.toBeNull()
    expect(within(legacyRow as HTMLElement).getByText('历史未分类')).toBeInTheDocument()
  })

  it('shows future-plan semantics and exposes only valid action entries', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onCancel = vi.fn()
    const onMatch = vi.fn()
    const onUnmatch = vi.fn()
    const onConvertToTask = vi.fn()

    const { container } = render(
      <MemoryRouter>
        <EmployeeWeekPlanTable
          plans={[plan, { ...plan, id: 'plan-2', title: '已承接计划', carryStatus: 'MATCHED', matchedWorkItemId: 'work-2' }]}
          onEdit={onEdit}
          onCancel={onCancel}
          onMatch={onMatch}
          onUnmatch={onUnmatch}
          onConvertToTask={onConvertToTask}
        />
      </MemoryRouter>
    )

    expect(container.querySelector<HTMLElement>('.semi-table-body table')).toHaveStyle({
      width: '1610px',
    })
    const plannedRow = screen.getByText('完成灰度发布').closest('tr')
    expect(plannedRow).not.toBeNull()
    expect(within(plannedRow as HTMLElement).getByText('紧急')).toBeInTheDocument()
    expect(within(plannedRow as HTMLElement).getByText('需要测试组协作')).toBeInTheDocument()
    expect(plannedRow).toHaveTextContent('计划：先灰度再全量')
    expect(plannedRow).toHaveTextContent('备注：导入备注')
    expect(within(plannedRow as HTMLElement).getByText('待承接')).toBeInTheDocument()
    expect(within(plannedRow as HTMLElement).getByText('张明 / 下周计划 / 第 21 行')).toBeInTheDocument()
    expect(within(plannedRow as HTMLElement).getByRole('link', { name: 'RD-026 权限平台' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-1/overview'
    )

    await user.click(within(plannedRow as HTMLElement).getByRole('button', { name: '编辑系统字段' }))
    await user.click(within(plannedRow as HTMLElement).getByRole('button', { name: '承接' }))
    await user.click(within(plannedRow as HTMLElement).getByRole('button', { name: '转任务' }))
    await user.click(within(plannedRow as HTMLElement).getByRole('button', { name: '取消计划' }))

    expect(onEdit).toHaveBeenCalledWith(plan)
    expect(onMatch).toHaveBeenCalledWith(plan)
    expect(onConvertToTask).toHaveBeenCalledWith(plan)
    expect(onCancel).toHaveBeenCalledWith(plan)

    const matchedRow = screen.getByText('已承接计划').closest('tr')
    expect(matchedRow).not.toBeNull()
    await user.click(within(matchedRow as HTMLElement).getByRole('button', { name: '撤销承接' }))
    expect(onUnmatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-2' }))
  })

  it('highlights a deep-linked future plan', () => {
    render(
      <MemoryRouter>
        <EmployeeWeekPlanTable plans={[plan]} focusedPlanId="plan-1" />
      </MemoryRouter>
    )

    expect(screen.getByText('完成灰度发布').closest('tr')).toHaveClass(
      'employee-week-plan-table__row--focused'
    )
  })

  it('reserves enough horizontal canvas for all current-work actions', () => {
    const { container } = render(
      <MemoryRouter>
        <EmployeeWorkTable
          items={[workItem]}
          onEdit={vi.fn()}
          onConvertRisk={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(container.querySelector<HTMLElement>('.semi-table-body table')).toHaveStyle({
      width: '1586px',
    })
  })
})
