import { useMemo, useState } from 'react'
import {
  Banner,
  Button,
  Checkbox,
  InputNumber,
  Modal,
  Table,
  Tag,
  TextArea,
} from '@douyinfe/semi-ui'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { WorkspaceSelect } from '@/components/workspace/WorkspaceSelect'
import type {
  EmployeeRiskDecision,
  EmployeeWorkImportRow,
  EmployeeWorkKind,
  EmployeeWorkSourceSection,
  ResolveEmployeeImportInput,
  ResolveEmployeeImportRowInput,
} from '../types'

interface EmployeeOption {
  id: string
  displayName: string
}

interface ProjectOption {
  id: string
  code: string
  name: string
}

interface TaskOption {
  id: string
  projectId: string | null
  code: string
  title: string
}

interface EmployeeImportAssociationModalProps {
  visible: boolean
  rows: EmployeeWorkImportRow[]
  employees?: EmployeeOption[]
  projects: ProjectOption[]
  tasks: TaskOption[]
  loading?: boolean
  saving?: boolean
  onCancel: () => void
  onSubmit: (input: ResolveEmployeeImportInput) => void
}

interface AssociationDraft {
  rowId: string
  employeeId: string | null
  workKind: EmployeeWorkKind | null
  projectId: string | null
  taskId: string | null
  plannedHours: number | null
  actualHours: number | null
  createEmployee: boolean
  updateEmployeeProfile: boolean
  riskDecision: EmployeeRiskDecision | null
  riskText: string | null
}

type DraftErrors = Partial<Record<'employee' | 'workKind' | 'project' | 'task' | 'risk', string>>

const SECTION_OPTIONS = [
  { value: 'ALL', label: '全部区域' },
  { value: 'CURRENT_WORK', label: '本周工作' },
  { value: 'NEXT_WEEK_PLAN', label: '下周计划' },
]
const WORK_KIND_OPTIONS = [
  { value: 'PROJECT', label: '项目工作' },
  { value: 'NON_PROJECT', label: '非项目工作' },
]

function normalizedTitle(row: EmployeeWorkImportRow): string {
  const title = row.normalizedValues.title
  return typeof title === 'string' ? title : '无法解析的行'
}

function normalizedEmployeeName(row: EmployeeWorkImportRow): string {
  const employeeName = row.normalizedValues.employeeName
  return typeof employeeName === 'string' ? employeeName : '未识别员工'
}

function employeeDisplayName(row: EmployeeWorkImportRow): string {
  return normalizedEmployeeName(row).normalize('NFKC').trim().replace(/\s+/gu, ' ')
}

function normalizedEmployeeNameKey(row: EmployeeWorkImportRow): string {
  return employeeDisplayName(row).toLowerCase()
}

function hasImportEmployeeName(row: EmployeeWorkImportRow): boolean {
  const employeeName = row.normalizedValues.employeeName
  return typeof employeeName === 'string' && employeeName.trim().length > 0
}

function rowSection(row: EmployeeWorkImportRow): EmployeeWorkSourceSection {
  if (row.sourceSection) return row.sourceSection
  return row.normalizedValues.sourceSection === 'NEXT_WEEK_PLAN' ? 'NEXT_WEEK_PLAN' : 'CURRENT_WORK'
}

function isRiskCandidate(row: EmployeeWorkImportRow): boolean {
  if (row.riskCandidate !== undefined) return row.riskCandidate
  if (rowSection(row) !== 'CURRENT_WORK') return false
  const normalized = row.normalizedValues
  return (
    'status' in normalized &&
    (normalized.status === 'AT_RISK' || normalized.status === 'BLOCKED') &&
    'summaryText' in normalized &&
    typeof normalized.summaryText === 'string' &&
    normalized.summaryText.trim().length > 0
  )
}

function makeDraft(row: EmployeeWorkImportRow): AssociationDraft {
  const normalized = row.normalizedValues
  return {
    rowId: row.id,
    employeeId: row.resolvedEmployeeId,
    workKind: row.workKind ?? null,
    projectId: row.resolvedProjectId,
    taskId: row.resolvedTaskId,
    plannedHours:
      row.plannedHours ??
      ('plannedHours' in normalized && typeof normalized.plannedHours === 'number'
        ? normalized.plannedHours
        : null),
    actualHours:
      row.actualHours ??
      ('actualHours' in normalized && typeof normalized.actualHours === 'number'
        ? normalized.actualHours
        : null),
    createEmployee: !row.resolvedEmployeeId && hasImportEmployeeName(row),
    updateEmployeeProfile: Boolean(row.resolvedEmployeeId) && row.profileAction === 'UPDATE',
    riskDecision: row.riskDecision ?? null,
    riskText:
      row.riskText ??
      ('riskText' in normalized && typeof normalized.riskText === 'string'
        ? normalized.riskText
        : null),
  }
}

function validateDraft(
  row: EmployeeWorkImportRow,
  draft: AssociationDraft,
  tasks: TaskOption[]
): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.employeeId && !draft.createEmployee) errors.employee = '请选择或新建员工'
  if (!draft.workKind) errors.workKind = '请选择工作类型'
  if (draft.workKind === 'PROJECT' && !draft.projectId) errors.project = '请选择项目'
  if (
    draft.taskId &&
    (!draft.projectId ||
      !tasks.some((task) => task.id === draft.taskId && task.projectId === draft.projectId))
  ) {
    errors.task = '任务不属于所选项目'
  }
  if (isRiskCandidate(row) && !draft.riskDecision) errors.risk = '请确认风险候选'
  return errors
}

function toResolution(
  row: EmployeeWorkImportRow,
  draft: AssociationDraft
): ResolveEmployeeImportRowInput {
  const normalized = row.normalizedValues
  const employeeName = employeeDisplayName(row)
  const department =
    'department' in normalized && typeof normalized.department === 'string'
      ? normalized.department
      : undefined
  const workDirection =
    'workDirection' in normalized && typeof normalized.workDirection === 'string'
      ? normalized.workDirection
      : undefined
  return {
    rowId: draft.rowId,
    ...(draft.createEmployee
      ? {
          createEmployee: {
            displayName: employeeName,
            ...(department ? { department } : {}),
            ...(workDirection ? { workDirection } : {}),
          },
        }
      : { employeeId: draft.employeeId }),
    ...(draft.updateEmployeeProfile ? { updateEmployeeProfile: true } : {}),
    workKind: draft.workKind!,
    projectId: draft.workKind === 'PROJECT' ? draft.projectId : null,
    taskId: draft.workKind === 'PROJECT' ? draft.taskId : null,
    plannedHours: draft.plannedHours,
    actualHours: draft.actualHours,
    ...(draft.riskDecision ? { riskDecision: draft.riskDecision } : {}),
    ...(draft.riskDecision === 'KEEP' || draft.riskDecision === 'EDIT'
      ? { riskText: draft.riskText }
      : {}),
  }
}

function toResolutions(
  rows: EmployeeWorkImportRow[],
  drafts: Record<string, AssociationDraft>
): ResolveEmployeeImportRowInput[] {
  const createdEmployeeNameKeys = new Set<string>()
  return rows.map((row) => {
    const draft = drafts[row.id]!
    const resolution = toResolution(row, draft)
    if (!draft.createEmployee) return resolution

    const employeeNameKey = normalizedEmployeeNameKey(row)
    if (!createdEmployeeNameKeys.has(employeeNameKey)) {
      createdEmployeeNameKeys.add(employeeNameKey)
      return resolution
    }

    const reusedResolution = { ...resolution }
    delete reusedResolution.createEmployee
    return reusedResolution
  })
}

export function EmployeeImportAssociationModal({
  visible,
  rows,
  employees = [],
  projects,
  tasks,
  loading = false,
  saving = false,
  onCancel,
  onSubmit,
}: EmployeeImportAssociationModalProps) {
  const [drafts, setDrafts] = useState<Record<string, AssociationDraft>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, makeDraft(row)]))
  )
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])
  const [sheetFilter, setSheetFilter] = useState('ALL')
  const [sectionFilter, setSectionFilter] = useState<'ALL' | EmployeeWorkSourceSection>('ALL')

  const sheets = useMemo(
    () => [
      ...new Set(
        rows.map((row) => row.sourceSheetName).filter((name): name is string => Boolean(name))
      ),
    ],
    [rows]
  )
  const visibleRows = useMemo(() => {
    const filteredRows = rows.filter(
      (row) =>
        (sheetFilter === 'ALL' || row.sourceSheetName === sheetFilter) &&
        (sectionFilter === 'ALL' || rowSection(row) === sectionFilter)
    )
    const employeeGroups = new Map<string, EmployeeWorkImportRow[]>()
    filteredRows.forEach((row) => {
      const key = normalizedEmployeeNameKey(row)
      const group = employeeGroups.get(key)
      if (group) {
        group.push(row)
      } else {
        employeeGroups.set(key, [row])
      }
    })
    return [...employeeGroups.values()].flat()
  }, [rows, sectionFilter, sheetFilter])
  const visibleEmployeeGroups = useMemo(() => {
    const groups = new Map<string, { rowSpan: number; groupCount: number }>()
    let groupStart = 0
    while (groupStart < visibleRows.length) {
      const groupKey = normalizedEmployeeNameKey(visibleRows[groupStart]!)
      let groupEnd = groupStart + 1
      while (
        groupEnd < visibleRows.length &&
        normalizedEmployeeNameKey(visibleRows[groupEnd]!) === groupKey
      ) {
        groupEnd += 1
      }
      const groupCount = groupEnd - groupStart
      visibleRows.slice(groupStart, groupEnd).forEach((row, index) => {
        groups.set(row.id, { rowSpan: index === 0 ? groupCount : 0, groupCount })
      })
      groupStart = groupEnd
    }
    return groups
  }, [visibleRows])
  const validation = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          drafts[row.id]
            ? validateDraft(row, drafts[row.id]!, tasks)
            : ({ workKind: '请选择工作类型' } satisfies DraftErrors),
        ])
      ),
    [drafts, rows, tasks]
  )
  const invalidCount = Object.values(validation).filter(
    (errors) => Object.keys(errors).length > 0
  ).length

  function updateDraft(rowId: string, update: Partial<AssociationDraft>) {
    setDrafts((current) => ({
      ...current,
      [rowId]: { ...current[rowId]!, ...update },
    }))
  }

  function updateEmployeeGroup(row: EmployeeWorkImportRow, update: Partial<AssociationDraft>) {
    const employeeNameKey = normalizedEmployeeNameKey(row)
    setDrafts((current) => {
      const next = { ...current }
      rows.forEach((candidate) => {
        if (normalizedEmployeeNameKey(candidate) !== employeeNameKey) return
        next[candidate.id] = { ...current[candidate.id]!, ...update }
      })
      return next
    })
  }

  function setWorkKind(rowId: string, workKind: EmployeeWorkKind) {
    updateDraft(
      rowId,
      workKind === 'NON_PROJECT' ? { workKind, projectId: null, taskId: null } : { workKind }
    )
  }

  function bulkSetWorkKind(value: unknown) {
    const workKind = value as EmployeeWorkKind
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([rowId, draft]) => [
          rowId,
          selectedRowIds.includes(rowId)
            ? workKind === 'NON_PROJECT'
              ? { ...draft, workKind, projectId: null, taskId: null }
              : { ...draft, workKind }
            : draft,
        ])
      )
    )
  }

  const columns: ColumnProps<EmployeeWorkImportRow>[] = [
    {
      title: '员工',
      width: 190,
      render: (_, row) => {
        const groupInfo = visibleEmployeeGroups.get(row.id) ?? { rowSpan: 1, groupCount: 1 }
        if (groupInfo.rowSpan === 0) {
          return { children: null, props: { rowSpan: 0 } }
        }
        const draft = drafts[row.id]
        if (!draft) return null
        const employeeName = employeeDisplayName(row)
        const groupCount = groupInfo.groupCount
        const normalized = row.normalizedValues
        const hasProfileValues =
          ('department' in normalized && Boolean(normalized.department)) ||
          ('workDirection' in normalized && Boolean(normalized.workDirection))
        const content =
          employees.length > 0 || !draft.employeeId ? (
            <div className="employee-import-association__cell">
              {draft.createEmployee ? (
                <Tag color="blue">将新建：{employeeName}</Tag>
              ) : (
                <WorkspaceSelect
                  aria-label={`员工关联：${employeeName}`}
                  value={draft.employeeId ?? ''}
                  placeholder="选择员工"
                  filter
                  options={employees.map((employee) => ({
                    value: employee.id,
                    label: employee.displayName,
                  }))}
                  onChange={(value) =>
                    updateEmployeeGroup(row, {
                      employeeId: value || null,
                      createEmployee: false,
                      updateEmployeeProfile: false,
                    })
                  }
                />
              )}
              {!draft.employeeId || draft.createEmployee ? (
                <Button
                  size="small"
                  theme="borderless"
                  aria-label={
                    draft.createEmployee
                      ? `改为关联现有员工：${employeeName}`
                      : `新建员工档案：${employeeName}`
                  }
                  onClick={() =>
                    updateEmployeeGroup(row, {
                      employeeId: null,
                      createEmployee: !draft.createEmployee,
                      updateEmployeeProfile: false,
                    })
                  }
                >
                  {draft.createEmployee ? '改为关联现有员工' : '按表内姓名新建'}
                </Button>
              ) : null}
              {draft.employeeId && hasProfileValues ? (
                <Checkbox
                  aria-label="用表内部门/方向更新档案"
                  checked={draft.updateEmployeeProfile}
                  onChange={(event) =>
                    updateEmployeeGroup(row, {
                      updateEmployeeProfile: Boolean(event.target.checked),
                    })
                  }
                >
                  用表内部门/方向更新档案
                </Checkbox>
              ) : null}
              {validation[row.id]?.employee ? (
                <small className="employee-import-association__error">
                  {validation[row.id]?.employee}
                </small>
              ) : (
                <small>共 {groupCount} 条工作/计划</small>
              )}
            </div>
          ) : (
            <div className="employee-import-association__cell">
              <span>{employeeName}</span>
              <small>共 {groupCount} 条工作/计划</small>
            </div>
          )
        return { children: content, props: { rowSpan: groupInfo.rowSpan } }
      },
    },
    {
      title: '来源',
      width: 150,
      render: (_, row) => (
        <div className="employee-import-association__cell">
          <span>{row.sourceSheetName ?? '工作明细'}</span>
          <small>
            {rowSection(row) === 'CURRENT_WORK' ? '本周工作' : '下周计划'} · 第{' '}
            {row.sourceRowNumber ?? row.rowNumber} 行
          </small>
        </div>
      ),
    },
    {
      title: '工作标题',
      width: 220,
      render: (_, row) => (
        <span className="employee-import-association__title">{normalizedTitle(row)}</span>
      ),
    },
    {
      title: '工作类型',
      width: 150,
      render: (_, row) => {
        const draft = drafts[row.id]
        if (!draft) return null
        return (
          <div className="employee-import-association__cell">
            <WorkspaceSelect
              aria-label={`第 ${row.rowNumber} 行工作类型`}
              value={draft.workKind ?? ''}
              placeholder="请选择"
              options={WORK_KIND_OPTIONS}
              onChange={(value) => {
                if (value) setWorkKind(row.id, value as EmployeeWorkKind)
              }}
            />
            {validation[row.id]?.workKind ? (
              <small className="employee-import-association__error">
                {validation[row.id]?.workKind}
              </small>
            ) : null}
          </div>
        )
      },
    },
    {
      title: '项目 / 任务',
      width: 260,
      render: (_, row) => {
        const draft = drafts[row.id]
        if (!draft || draft.workKind !== 'PROJECT')
          return <span className="employee-import-association__muted">不关联</span>
        const taskOptions = tasks.filter((task) => task.projectId === draft.projectId)
        return (
          <div className="employee-import-association__cell employee-import-association__relations">
            <WorkspaceSelect
              aria-label={`第 ${row.rowNumber} 行项目`}
              value={draft.projectId ?? ''}
              placeholder="选择项目"
              filter
              options={projects.map((project) => ({
                value: project.id,
                label: `${project.code} · ${project.name}`,
              }))}
              onChange={(value) => updateDraft(row.id, { projectId: value || null, taskId: null })}
            />
            {validation[row.id]?.project ? (
              <small className="employee-import-association__error">
                {validation[row.id]?.project}
              </small>
            ) : null}
            <WorkspaceSelect
              aria-label={`第 ${row.rowNumber} 行任务`}
              value={draft.taskId ?? ''}
              placeholder="选择任务（可选）"
              filter
              disabled={!draft.projectId}
              options={taskOptions.map((task) => ({
                value: task.id,
                label: `${task.code} · ${task.title}`,
              }))}
              onChange={(value) => updateDraft(row.id, { taskId: value || null })}
            />
            {validation[row.id]?.task ? (
              <small className="employee-import-association__error">
                {validation[row.id]?.task}
              </small>
            ) : null}
          </div>
        )
      },
    },
    {
      title: '工时',
      width: 190,
      render: (_, row) => {
        const draft = drafts[row.id]
        if (!draft) return null
        return (
          <div className="employee-import-association__hours">
            <InputNumber
              aria-label={`第 ${row.rowNumber} 行计划工时`}
              value={draft.plannedHours ?? undefined}
              min={0}
              max={168}
              placeholder="计划"
              onNumberChange={(value) =>
                updateDraft(row.id, {
                  plannedHours: value === undefined || value === null ? null : Number(value),
                })
              }
            />
            {rowSection(row) === 'CURRENT_WORK' ? (
              <InputNumber
                aria-label={`第 ${row.rowNumber} 行实际工时`}
                value={draft.actualHours ?? undefined}
                min={0}
                max={168}
                placeholder="实际"
                onNumberChange={(value) =>
                  updateDraft(row.id, {
                    actualHours: value === undefined || value === null ? null : Number(value),
                  })
                }
              />
            ) : (
              <span className="employee-import-association__muted">实际工时不适用</span>
            )}
          </div>
        )
      },
    },
    {
      title: '风险候选',
      width: 230,
      render: (_, row) => {
        const draft = drafts[row.id]
        if (!draft) return null
        if (!isRiskCandidate(row)) return <Tag color="grey">非候选</Tag>
        return (
          <div className="employee-import-association__cell">
            <div className="employee-import-association__risk-actions">
              <Button
                size="small"
                type={
                  draft.riskDecision === 'KEEP' || draft.riskDecision === 'EDIT'
                    ? 'primary'
                    : 'tertiary'
                }
                aria-label={`保留第 ${row.rowNumber} 行风险`}
                onClick={() => updateDraft(row.id, { riskDecision: 'KEEP' })}
              >
                保留
              </Button>
              <Button
                size="small"
                type={draft.riskDecision === 'REMOVE' ? 'primary' : 'tertiary'}
                aria-label={`移除第 ${row.rowNumber} 行风险`}
                onClick={() => updateDraft(row.id, { riskDecision: 'REMOVE', riskText: null })}
              >
                移除
              </Button>
            </div>
            {draft.riskDecision === 'KEEP' || draft.riskDecision === 'EDIT' ? (
              <TextArea
                aria-label={`第 ${row.rowNumber} 行风险说明`}
                value={draft.riskText ?? ''}
                autosize
                onChange={(riskText) =>
                  updateDraft(row.id, {
                    riskText,
                    riskDecision: riskText === row.riskText ? 'KEEP' : 'EDIT',
                  })
                }
              />
            ) : null}
            {validation[row.id]?.risk ? (
              <small className="employee-import-association__error">
                {validation[row.id]?.risk}
              </small>
            ) : null}
          </div>
        )
      },
    },
    {
      title: '校验',
      width: 110,
      fixed: 'right',
      render: (_, row) =>
        Object.keys(validation[row.id] ?? {}).length > 0 ? (
          <Tag color="red">待补全</Tag>
        ) : (
          <Tag color="green">已通过</Tag>
        ),
    },
  ]

  return (
    <Modal
      title="补全员工周报字段"
      visible={visible}
      width="96vw"
      footer={null}
      maskClosable={false}
      closeOnEsc={!saving}
      className="employee-import-association"
      onCancel={onCancel}
    >
      <div className="employee-import-association__layout">
        <Banner
          type={invalidCount > 0 ? 'warning' : 'success'}
          fullMode={false}
          closeIcon={null}
          title={
            invalidCount > 0
              ? `还有 ${invalidCount} 行需要补全，全部通过后才能继续。`
              : '全部行已通过校验，可以保存并进入导入确认。'
          }
        />
        <div className="employee-import-association__toolbar">
          <WorkspaceSelect
            aria-label="工作表筛选"
            value={sheetFilter}
            options={[
              { value: 'ALL', label: '全部工作表' },
              ...sheets.map((sheet) => ({ value: sheet, label: sheet })),
            ]}
            onChange={setSheetFilter}
          />
          <WorkspaceSelect
            aria-label="区域筛选"
            value={sectionFilter}
            options={SECTION_OPTIONS}
            onChange={(value) => setSectionFilter(value as 'ALL' | EmployeeWorkSourceSection)}
          />
          <WorkspaceSelect
            aria-label="批量设置工作类型"
            placeholder={
              selectedRowIds.length > 0 ? `批量设置 ${selectedRowIds.length} 行` : '先选择行'
            }
            disabled={selectedRowIds.length === 0}
            options={WORK_KIND_OPTIONS}
            onChange={bulkSetWorkKind}
          />
          <span>
            当前显示 {visibleRows.length} / {rows.length} 行
          </span>
        </div>
        <div className="employee-import-association__table">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={visibleRows}
            loading={loading}
            pagination={false}
            scroll={{ x: 1460 }}
            rowSelection={{
              selectedRowKeys: selectedRowIds,
              onChange: (keys) => setSelectedRowIds((keys ?? []).map(String)),
              getCheckboxProps: (row) => ({
                'aria-label': `选择第 ${row?.rowNumber ?? ''} 行`,
              }),
            }}
          />
        </div>
        <div
          className="workspace-modal-footer employee-import-association__footer"
          data-testid="employee-import-association-footer"
        >
          <span className="employee-import-association__footer-summary">
            已选 {selectedRowIds.length} 行 · 待补全 {invalidCount} 行
          </span>
          <Button disabled={saving} onClick={onCancel}>
            返回
          </Button>
          <Button
            theme="solid"
            type="primary"
            loading={saving}
            disabled={loading || saving || rows.length === 0 || invalidCount > 0}
            onClick={() =>
              onSubmit({
                rows: toResolutions(rows, drafts),
              })
            }
          >
            保存字段补全
          </Button>
        </div>
      </div>
    </Modal>
  )
}
