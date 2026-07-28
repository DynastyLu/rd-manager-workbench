import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Checkbox, DatePicker, Input, InputNumber, Select } from '@douyinfe/semi-ui'
import { toast } from 'sonner'

import { createMilestone, updateMilestone } from '@/modules/workbench/api/projects'
import type { Milestone, MilestoneStatus } from '@/modules/workbench/types'

const STATUS_OPTIONS = [
  { value: 'PENDING', label: '待开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'MISSED', label: '已逾期' },
]

export function MilestoneForm({
  projectId,
  milestone,
  onSuccess,
}: {
  projectId: string
  milestone?: Milestone
  onSuccess?: (milestone: Milestone) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(milestone?.name ?? '')
  const [plannedStartAt, setPlannedStartAt] = useState(milestone?.plannedStartAt?.slice(0, 10) ?? '')
  const [plannedEndAt, setPlannedEndAt] = useState(
    milestone?.plannedEndAt?.slice(0, 10) ?? milestone?.plannedAt?.slice(0, 10) ?? ''
  )
  const [weightPercent, setWeightPercent] = useState<number | undefined>(
    milestone?.weightPercent ?? undefined
  )
  const [manualCompletionPercent, setManualCompletionPercent] = useState(
    milestone?.manualCompletionPercent ?? milestone?.completionPercent ?? 0
  )
  const [ownerName, setOwnerName] = useState(milestone?.ownerName ?? '')
  const [status, setStatus] = useState<MilestoneStatus>(milestone?.status ?? 'PENDING')
  const [isCritical, setIsCritical] = useState(milestone?.isCritical ?? false)
  const [validationMessage, setValidationMessage] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        ...(plannedStartAt ? { plannedStartAt: new Date(`${plannedStartAt}T00:00:00`).toISOString() } : {}),
        ...(plannedEndAt ? { plannedEndAt: new Date(`${plannedEndAt}T00:00:00`).toISOString() } : {}),
        ...(weightPercent !== undefined ? { weightPercent } : {}),
        ...(milestone?.completionSource !== 'TASKS' ? { manualCompletionPercent } : {}),
        ...(ownerName.trim() ? { ownerName: ownerName.trim() } : {}),
        status,
        isCritical,
      }
      return milestone
        ? updateMilestone(projectId, milestone.id, input)
        : createMilestone(projectId, input)
    },
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success(milestone ? '里程碑已更新' : '里程碑已创建')
      onSuccess?.(saved)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存里程碑失败'),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setValidationMessage('请填写里程碑名称。')
      return
    }
    if (plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt) {
      setValidationMessage('计划结束时间不能早于计划开始时间。')
      return
    }
    setValidationMessage('')
    mutation.mutate()
  }

  return (
    <form className="workspace-modal-form" onSubmit={submit} noValidate>
      <label htmlFor="milestone-name"><span>里程碑名称</span><Input id="milestone-name" value={name} onChange={setName} /></label>
      <div className="workspace-modal-form__field" role="group" aria-labelledby="milestone-date-label">
        <span id="milestone-date-label">计划时间</span>
        <div className="workspace-modal-form__range">
          <DatePicker aria-label="计划开始" type="date" format="yyyy-MM-dd" value={plannedStartAt} onChange={(_, value) => setPlannedStartAt(String(value ?? ''))} style={{ width: '100%' }} showClear />
          <DatePicker aria-label="计划结束" type="date" format="yyyy-MM-dd" value={plannedEndAt} onChange={(_, value) => setPlannedEndAt(String(value ?? ''))} style={{ width: '100%' }} showClear />
        </div>
      </div>
      <label htmlFor="milestone-weight"><span>里程碑权重（自定义权重模式）</span><InputNumber id="milestone-weight" min={0} max={100} suffix="%" value={weightPercent} onNumberChange={(value) => setWeightPercent(value === undefined ? undefined : Number(value))} style={{ width: '100%' }} /></label>
      {milestone?.completionSource === 'TASKS' ? (
        <Banner type="info" description={`当前进度由 ${milestone.linkedTaskCount} 个工作项自动计算`} />
      ) : (
        <label htmlFor="milestone-manual-progress"><span>手工完成进度</span><InputNumber id="milestone-manual-progress" aria-label="手工完成进度" min={0} max={100} suffix="%" value={manualCompletionPercent} onNumberChange={(value) => setManualCompletionPercent(Number(value ?? 0))} style={{ width: '100%' }} /></label>
      )}
      <label htmlFor="milestone-owner"><span>负责人</span><Input id="milestone-owner" value={ownerName} onChange={setOwnerName} /></label>
      <div className="workspace-modal-form__field" role="group" aria-labelledby="milestone-status-label">
        <span id="milestone-status-label">状态</span>
        <Select aria-labelledby="milestone-status-label" value={status} onChange={(value) => setStatus(value as MilestoneStatus)} optionList={STATUS_OPTIONS} style={{ width: '100%' }} />
      </div>
      <Checkbox checked={isCritical} onChange={(event) => setIsCritical(Boolean(event.target.checked))}>关键里程碑</Checkbox>
      {validationMessage ? <p className="workspace-modal-form__error" role="alert">{validationMessage}</p> : null}
      <div className="workspace-modal-form__actions"><Button htmlType="submit" theme="solid" type="primary" loading={mutation.isPending}>{milestone ? '保存修改' : '保存里程碑'}</Button></div>
    </form>
  )
}
