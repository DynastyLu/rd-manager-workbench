import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, DatePicker, Input, Select } from '@douyinfe/semi-ui'
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
  const [plannedAt, setPlannedAt] = useState(milestone?.plannedAt?.slice(0, 10) ?? '')
  const [ownerName, setOwnerName] = useState(milestone?.ownerName ?? '')
  const [status, setStatus] = useState<MilestoneStatus>(milestone?.status ?? 'PENDING')
  const [isCritical, setIsCritical] = useState(milestone?.isCritical ?? false)
  const [validationMessage, setValidationMessage] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        ...(plannedAt ? { plannedAt: new Date(`${plannedAt}T00:00:00`).toISOString() } : {}),
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
    setValidationMessage('')
    mutation.mutate()
  }

  return (
    <form className="workspace-modal-form" onSubmit={submit} noValidate>
      <label htmlFor="milestone-name"><span>里程碑名称</span><Input id="milestone-name" value={name} onChange={setName} /></label>
      <div className="workspace-modal-form__field" role="group" aria-labelledby="milestone-date-label">
        <span id="milestone-date-label">计划日期</span>
        <DatePicker aria-labelledby="milestone-date-label" type="date" format="yyyy-MM-dd" value={plannedAt} onChange={(_, value) => setPlannedAt(String(value ?? ''))} style={{ width: '100%' }} showClear />
      </div>
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
