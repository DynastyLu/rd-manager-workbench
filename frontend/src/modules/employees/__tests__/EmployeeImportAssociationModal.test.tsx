import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'
import { EmployeeImportAssociationModal } from '../components/EmployeeImportAssociationModal'
import type { EmployeeWorkImportRow } from '../types'

function makeRow(overrides: Partial<EmployeeWorkImportRow> = {}): EmployeeWorkImportRow {
  return {
    id: 'row-current',
    rowNumber: 1,
    sourceSheetName: '张明',
    sourceSection: 'CURRENT_WORK',
    sourceRowNumber: 7,
    sourceKey: '张明:CURRENT_WORK:7',
    status: 'UNRESOLVED',
    errors: [],
    rawValues: {},
    normalizedValues: {
      sourceSection: 'CURRENT_WORK',
      rowNumber: 1,
      sourceSheetName: '张明',
      sourceRowNumber: 7,
      employeeName: '张明',
      title: '完成权限平台联调',
      plannedCompletionAt: '2026-07-10',
      planText: '完成接口联调',
      summaryText: '依赖服务不稳定',
      completionRate: 60,
      status: 'AT_RISK',
      nextPlanText: null,
      riskText: '依赖服务不稳定',
      plannedHours: null,
      actualHours: null,
      projectCode: null,
      taskCode: null,
      note: null,
      rawValues: {},
    },
    resolvedEmployeeId: 'employee-1',
    resolvedProjectId: null,
    resolvedTaskId: null,
    workKind: null,
    plannedHours: null,
    actualHours: null,
    riskCandidate: true,
    riskDecision: null,
    riskText: '依赖服务不稳定',
    keepUnlinked: false,
    workItemId: null,
    links: { sourceBatch: '/employee-work-imports/batch-1' },
    ...overrides,
  }
}

const currentRow = makeRow()
const planRow = makeRow({
  id: 'row-plan',
  rowNumber: 2,
  sourceSheetName: '李华',
  sourceSection: 'NEXT_WEEK_PLAN',
  sourceRowNumber: 15,
  sourceKey: '李华:NEXT_WEEK_PLAN:15',
  normalizedValues: {
    sourceSection: 'NEXT_WEEK_PLAN',
    rowNumber: 2,
    sourceSheetName: '李华',
    sourceRowNumber: 15,
    employeeName: '李华',
    department: '研发部',
    workDirection: '材料研发',
    title: '启动材料平台压测',
    deliverableText: '压测报告',
    plannedCompletionAt: '2026-07-17',
    priority: 'HIGH',
    collaborationText: null,
    planText: null,
    note: null,
    rawValues: {},
  },
  resolvedEmployeeId: 'employee-2',
  riskCandidate: false,
  riskDecision: 'REMOVE',
  riskText: null,
})

const projects = [
  { id: 'project-1', code: 'RD-001', name: '权限平台' },
  { id: 'project-2', code: 'RD-002', name: '材料平台' },
]
const tasks = [
  { id: 'task-1', projectId: 'project-1', code: 'RD-001-T1', title: '接口联调' },
  { id: 'task-2', projectId: 'project-2', code: 'RD-002-T1', title: '压力测试' },
]

describe('EmployeeImportAssociationModal', () => {
  it('filters rows by worksheet and source section without losing draft edits', async () => {
    render(
      <EmployeeImportAssociationModal
        visible
        rows={[currentRow, planRow]}
        projects={projects}
        tasks={tasks}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByText('完成权限平台联调')).toBeInTheDocument()
    expect(screen.getByText('启动材料平台压测')).toBeInTheDocument()

    await selectSemiOption(screen.getByLabelText('第 1 行工作类型'), 'NON_PROJECT')
    await selectSemiOption(screen.getByLabelText('工作表筛选'), '李华')
    expect(
      await screen.findByText('启动材料平台压测', undefined, { timeout: 10_000 })
    ).toBeInTheDocument()
    expect(screen.queryByText('完成权限平台联调')).not.toBeInTheDocument()

    await selectSemiOption(screen.getByLabelText('工作表筛选'), '张明')
    expect(
      await screen.findByLabelText('第 1 行工作类型', undefined, { timeout: 10_000 })
    ).toHaveTextContent('非项目工作')

    await selectSemiOption(screen.getByLabelText('区域筛选'), 'NEXT_WEEK_PLAN')
    expect(screen.queryByText('完成权限平台联调')).not.toBeInTheDocument()
    expect(screen.getByText('当前显示 0 / 2 行')).toBeInTheDocument()
  })

  it('bulk sets work kind and validates project rows before submission', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EmployeeImportAssociationModal
        visible
        rows={[currentRow, planRow]}
        projects={projects}
        tasks={tasks}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.click(screen.getByRole('checkbox', { name: '选择第 1 行' }))
    await user.click(screen.getByRole('checkbox', { name: '选择第 2 行' }))
    await selectSemiOption(screen.getByLabelText('批量设置工作类型'), 'PROJECT')

    expect(screen.getAllByText('请选择项目')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '保存字段补全' })).toBeDisabled()

    await selectSemiOption(screen.getByLabelText('第 1 行项目'), 'project-1')
    expect(screen.getByLabelText('第 1 行任务')).not.toBeDisabled()
    await selectSemiOption(screen.getByLabelText('第 1 行任务'), 'task-1')
    expect(screen.queryByText('RD-002-T1 · 压力测试')).not.toBeInTheDocument()
    await selectSemiOption(screen.getByLabelText('第 2 行项目'), 'project-2')

    await user.click(screen.getByRole('button', { name: '保留第 1 行风险' }))
    expect(screen.getByRole('button', { name: '保存字段补全' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '保存字段补全' }))

    expect(onSubmit).toHaveBeenCalledWith({
      rows: [
        expect.objectContaining({
          rowId: 'row-current',
          workKind: 'PROJECT',
          projectId: 'project-1',
          taskId: 'task-1',
          riskDecision: 'KEEP',
        }),
        expect.objectContaining({
          rowId: 'row-plan',
          workKind: 'PROJECT',
          projectId: 'project-2',
        }),
      ],
    })
  })

  it('clears project and task for non-project work and accepts optional hours', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EmployeeImportAssociationModal
        visible
        rows={[
          makeRow({
            workKind: 'PROJECT',
            resolvedProjectId: 'project-1',
            resolvedTaskId: 'task-1',
            riskDecision: 'KEEP',
          }),
        ]}
        projects={projects}
        tasks={tasks}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.clear(screen.getByLabelText('第 1 行计划工时'))
    await user.type(screen.getByLabelText('第 1 行计划工时'), '12.5')
    await user.clear(screen.getByLabelText('第 1 行实际工时'))
    await user.type(screen.getByLabelText('第 1 行实际工时'), '9')
    await selectSemiOption(screen.getByLabelText('第 1 行工作类型'), 'NON_PROJECT')
    expect(screen.queryByLabelText('第 1 行项目')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('第 1 行任务')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存字段补全' }))
    expect(onSubmit).toHaveBeenCalledWith({
      rows: [
        expect.objectContaining({
          rowId: 'row-current',
          workKind: 'NON_PROJECT',
          projectId: null,
          taskId: null,
          plannedHours: 12.5,
          actualHours: 9,
        }),
      ],
    })
  })

  it('uses a fixed action area and reports unresolved row errors', () => {
    render(
      <EmployeeImportAssociationModal
        visible
        rows={[currentRow]}
        projects={projects}
        tasks={tasks}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByText('请选择工作类型')).toBeInTheDocument()
    expect(screen.getByText('请确认风险候选')).toBeInTheDocument()
    expect(screen.getByTestId('employee-import-association-footer')).toHaveClass(
      'employee-import-association__footer'
    )
  })

  it('can create a missing employee and restore an employee profile update decision', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EmployeeImportAssociationModal
        visible
        rows={[
          makeRow({
            resolvedEmployeeId: null,
            normalizedValues: {
              ...currentRow.normalizedValues,
              employeeName: '新员工',
              department: '研发部',
              workDirection: '平台研发',
            },
            workKind: 'NON_PROJECT',
            riskCandidate: false,
          }),
          makeRow({
            id: 'row-existing',
            rowNumber: 2,
            resolvedEmployeeId: 'employee-1',
            profileAction: 'UPDATE',
            normalizedValues: {
              ...planRow.normalizedValues,
              employeeName: '张明',
              department: '研发部',
              workDirection: '平台研发',
            },
            workKind: 'NON_PROJECT',
            riskCandidate: false,
          }),
        ]}
        employees={[{ id: 'employee-1', displayName: '张明' }]}
        projects={projects}
        tasks={tasks}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    expect(screen.getByText('将新建：新员工')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '用表内部门/方向更新档案' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '保存字段补全' }))

    expect(onSubmit).toHaveBeenCalledWith({
      rows: [
        expect.objectContaining({
          rowId: 'row-current',
          createEmployee: {
            displayName: '新员工',
            department: '研发部',
            workDirection: '平台研发',
          },
        }),
        expect.objectContaining({
          rowId: 'row-existing',
          employeeId: 'employee-1',
          updateEmployeeProfile: true,
        }),
      ],
    })
  })

  it('submits one create directive for repeated rows belonging to the same employee', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const newEmployeeValues = {
      ...currentRow.normalizedValues,
      employeeName: '新员工',
      department: '研发部',
      workDirection: '平台研发',
    }
    render(
      <EmployeeImportAssociationModal
        visible
        rows={[
          makeRow({
            resolvedEmployeeId: null,
            normalizedValues: newEmployeeValues,
            workKind: 'NON_PROJECT',
            riskCandidate: false,
          }),
          makeRow({
            id: 'row-current-2',
            rowNumber: 2,
            resolvedEmployeeId: null,
            normalizedValues: {
              ...newEmployeeValues,
              rowNumber: 2,
              sourceRowNumber: 8,
              title: '补充回归测试',
            },
            workKind: 'NON_PROJECT',
            riskCandidate: false,
          }),
        ]}
        projects={projects}
        tasks={tasks}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    expect(screen.getAllByText('将新建：新员工')).toHaveLength(1)
    expect(screen.getByText('共 2 条工作/计划')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', {
        name: '改为关联现有员工：新员工',
      })
    ).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '保存字段补全' }))

    const submittedRows = onSubmit.mock.calls[0]?.[0].rows
    expect(submittedRows.filter((row) => row.createEmployee)).toHaveLength(1)
    expect(submittedRows[1]).not.toHaveProperty('employeeId')
  })

  it('applies one existing employee selection to every row in the same employee group', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const newEmployeeValues = {
      ...currentRow.normalizedValues,
      employeeName: ' 新员工 ',
      department: '研发部',
      workDirection: '平台研发',
    }
    render(
      <EmployeeImportAssociationModal
        visible
        rows={[
          makeRow({
            resolvedEmployeeId: null,
            normalizedValues: newEmployeeValues,
            workKind: 'NON_PROJECT',
            riskCandidate: false,
          }),
          makeRow({
            id: 'row-current-2',
            rowNumber: 2,
            resolvedEmployeeId: null,
            normalizedValues: {
              ...newEmployeeValues,
              employeeName: '新员工',
              rowNumber: 2,
              sourceRowNumber: 8,
              title: '补充回归测试',
            },
            workKind: 'NON_PROJECT',
            riskCandidate: false,
          }),
        ]}
        employees={[{ id: 'employee-existing', displayName: '王工程师' }]}
        projects={projects}
        tasks={tasks}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.click(
      screen.getByRole('button', {
        name: '改为关联现有员工：新员工',
      })
    )
    await selectSemiOption(screen.getByLabelText('员工关联：新员工'), 'employee-existing')
    await user.click(screen.getByRole('button', { name: '保存字段补全' }))

    const submittedRows = onSubmit.mock.calls[0]?.[0].rows
    expect(submittedRows).toHaveLength(2)
    expect(submittedRows).toEqual([
      expect.objectContaining({
        rowId: 'row-current',
        employeeId: 'employee-existing',
      }),
      expect.objectContaining({
        rowId: 'row-current-2',
        employeeId: 'employee-existing',
      }),
    ])
    expect(submittedRows[0]).not.toHaveProperty('createEmployee')
    expect(submittedRows[1]).not.toHaveProperty('createEmployee')
  })
})
