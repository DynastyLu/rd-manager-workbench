import { useMemo, useState } from 'react'
import { Button, InputNumber, Modal, Select, TextArea } from '@douyinfe/semi-ui'
import { WorkspaceDatePicker } from '@/components/workspace/WorkspaceDatePicker'
import type {
  EmployeeWorkItem,
  EmployeeWorkKind,
  UpdateEmployeeWorkItemInput,
} from '../types'

export interface EmployeeWorkItemReferenceOption {
  value: string
  label: string
  projectId?: string | null
}

interface EmployeeWorkItemEditorProps {
  item: EmployeeWorkItem | null
  projects: EmployeeWorkItemReferenceOption[]
  tasks: EmployeeWorkItemReferenceOption[]
  loading?: boolean
  onCancel: () => void
  onSubmit: (item: EmployeeWorkItem, input: UpdateEmployeeWorkItemInput) => void
}

interface Draft {
  workKind: EmployeeWorkKind
  projectId: string
  taskId: string
  plannedCompletionAt: string
  plannedHours: number | null
  actualHours: number | null
  riskText: string
}

function draftFrom(item: EmployeeWorkItem): Draft {
  return {
    workKind: item.workKind ?? 'NON_PROJECT',
    projectId: item.project?.id ?? '',
    taskId: item.task?.id ?? '',
    plannedCompletionAt: item.plannedCompletionDate ?? '',
    plannedHours: item.plannedHours,
    actualHours: item.actualHours,
    riskText: item.riskText ?? '',
  }
}

export function EmployeeWorkItemEditor({
  item,
  projects,
  tasks,
  loading = false,
  onCancel,
  onSubmit,
}: EmployeeWorkItemEditorProps) {
  const [draft, setDraft] = useState<Draft | null>(item ? draftFrom(item) : null)

  const taskOptions = useMemo(
    () => tasks.filter((task) => !task.projectId || task.projectId === draft?.projectId),
    [draft?.projectId, tasks]
  )

  function submit() {
    if (!item || !draft) return
    onSubmit(item, {
      workKind: draft.workKind,
      projectId: draft.workKind === 'PROJECT' ? draft.projectId || null : null,
      taskId: draft.workKind === 'PROJECT' ? draft.taskId || null : null,
      plannedCompletionAt: draft.plannedCompletionAt || null,
      plannedHours: draft.plannedHours,
      actualHours: draft.actualHours,
      riskText: draft.riskText.trim() || null,
    })
  }

  return (
    <Modal
      title="编辑工作系统字段"
      visible={Boolean(item && draft)}
      width={600}
      onCancel={onCancel}
      footer={
        <div className="workspace-modal-footer">
          <Button onClick={onCancel}>取消</Button>
          <Button
            theme="solid"
            type="primary"
            loading={loading}
            disabled={draft?.workKind === 'PROJECT' && !draft.projectId}
            onClick={submit}
          >
            保存修改
          </Button>
        </div>
      }
    >
      {draft ? (
        <div className="employee-detail__plan-form">
          <div className="employee-detail__plan-field" role="group" aria-label="工作类型字段">
            <span>工作类型</span>
            <Select
              aria-label="工作类型"
              value={draft.workKind}
              optionList={[
                { value: 'PROJECT', label: '项目工作' },
                { value: 'NON_PROJECT', label: '非项目工作' },
              ]}
              onChange={(value) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        workKind: value as EmployeeWorkKind,
                        ...(value === 'NON_PROJECT' ? { projectId: '', taskId: '' } : {}),
                      }
                    : current
                )
              }
            />
          </div>
          {draft.workKind === 'PROJECT' ? (
            <div className="workspace-modal-form__grid">
              <div className="employee-detail__plan-field" role="group" aria-label="关联项目字段">
                <span>关联项目</span>
                <Select
                  aria-label="关联项目"
                  filter
                  value={draft.projectId || undefined}
                  placeholder="请选择项目"
                  optionList={projects}
                  onChange={(value) =>
                    setDraft((current) =>
                      current ? { ...current, projectId: String(value), taskId: '' } : current
                    )
                  }
                />
              </div>
              <div className="employee-detail__plan-field" role="group" aria-label="关联任务字段">
                <span>关联任务（可选）</span>
                <Select
                  aria-label="关联任务"
                  filter
                  showClear
                  value={draft.taskId || undefined}
                  placeholder="请选择项目内任务"
                  optionList={taskOptions}
                  onChange={(value) =>
                    setDraft((current) =>
                      current ? { ...current, taskId: value ? String(value) : '' } : current
                    )
                  }
                />
              </div>
            </div>
          ) : null}
          <div className="workspace-modal-form__grid">
            <div className="employee-detail__plan-field" role="group" aria-label="计划完成日字段">
              <span>计划完成日</span>
              <WorkspaceDatePicker
                aria-label="计划完成日"
                mode="date"
                value={draft.plannedCompletionAt}
                onChange={(value) =>
                  setDraft((current) =>
                    current ? { ...current, plannedCompletionAt: value } : current
                  )
                }
              />
            </div>
            <div className="employee-detail__plan-field">
              <span>计划 / 实际工时</span>
              <div className="workspace-modal-form__grid">
                <InputNumber
                  aria-label="计划工时"
                  min={0}
                  max={10_000}
                  precision={2}
                  value={draft.plannedHours ?? undefined}
                  placeholder="计划工时"
                  onChange={(value) =>
                    setDraft((current) =>
                      current
                        ? { ...current, plannedHours: value === '' ? null : Number(value) }
                        : current
                    )
                  }
                />
                <InputNumber
                  aria-label="实际工时"
                  min={0}
                  max={10_000}
                  precision={2}
                  value={draft.actualHours ?? undefined}
                  placeholder="实际工时"
                  onChange={(value) =>
                    setDraft((current) =>
                      current
                        ? { ...current, actualHours: value === '' ? null : Number(value) }
                        : current
                    )
                  }
                />
              </div>
            </div>
          </div>
          <div className="employee-detail__plan-field" role="group" aria-label="风险说明字段">
            <span>风险说明</span>
            <TextArea
              aria-label="风险说明"
              maxCount={2_000}
              value={draft.riskText}
              placeholder="没有风险可留空"
              onChange={(value) =>
                setDraft((current) => (current ? { ...current, riskText: value } : current))
              }
            />
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
