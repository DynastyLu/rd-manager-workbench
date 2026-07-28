import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, DatePicker, Input, Select, TextArea } from '@douyinfe/semi-ui'
import { toast } from 'sonner'

import { updateProject } from '@/modules/workbench/api/projects'
import type { ProjectDetail, ProjectHealth, ProjectPhase, ProjectStatus, ProjectWeightMode } from '@/modules/workbench/types'

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '进行中' },
  { value: 'ON_HOLD', label: '已暂停' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已终止' },
]

const PHASE_OPTIONS = [
  { value: 'DISCOVERY', label: '探索' },
  { value: 'PLANNING', label: '规划' },
  { value: 'RESEARCH', label: '研究' },
  { value: 'DEVELOPMENT', label: '开发' },
  { value: 'VALIDATION', label: '验证' },
  { value: 'DELIVERY', label: '交付' },
]

const HEALTH_OPTIONS = [
  { value: 'AUTO', label: '自动评估' },
  { value: 'GREEN', label: '健康' },
  { value: 'YELLOW', label: '需关注' },
  { value: 'RED', label: '有风险' },
]

const WEIGHT_MODE_OPTIONS = [
  { value: 'EQUAL', label: '平均分配' },
  { value: 'CUSTOM', label: '自定义权重' },
]

function toIsoDate(value: string) {
  return new Date(`${value}T00:00:00`).toISOString()
}

export function ProjectDetailsForm({
  project,
  onSuccess,
}: {
  project: ProjectDetail
  onSuccess?: () => void
}) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState(project.code)
  const [name, setName] = useState(project.name)
  const [objective, setObjective] = useState(project.objective ?? '')
  const [expectedOutcome, setExpectedOutcome] = useState(project.expectedOutcome ?? '')
  const [researchDirection, setResearchDirection] = useState(project.researchDirection ?? '')
  const [leadName, setLeadName] = useState(project.leadName ?? '')
  const [plannedStartAt, setPlannedStartAt] = useState(project.plannedStartAt?.slice(0, 10) ?? '')
  const [plannedEndAt, setPlannedEndAt] = useState(project.plannedEndAt?.slice(0, 10) ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [phase, setPhase] = useState<ProjectPhase>(project.phase)
  const [health, setHealth] = useState<ProjectHealth | 'AUTO'>(project.healthOverride ?? 'AUTO')
  const [weightMode, setWeightMode] = useState<ProjectWeightMode>(project.weightMode)
  const [validationMessage, setValidationMessage] = useState('')
  const mutation = useMutation({
    mutationFn: () => updateProject(project.id, {
      code: code.trim(),
      name: name.trim(),
      objective: objective.trim(),
      expectedOutcome: expectedOutcome.trim(),
      researchDirection: researchDirection.trim(),
      leadName: leadName.trim(),
      ...(plannedStartAt ? { plannedStartAt: toIsoDate(plannedStartAt) } : {}),
      ...(plannedEndAt ? { plannedEndAt: toIsoDate(plannedEndAt) } : {}),
      status,
      phase,
      healthOverride: health === 'AUTO' ? null : health,
      weightMode,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success('项目资料已更新')
      onSuccess?.()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存项目失败'),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!code.trim() || !name.trim()) {
      setValidationMessage('请填写项目编号和项目名称。')
      return
    }
    if (plannedStartAt && plannedEndAt && plannedStartAt > plannedEndAt) {
      setValidationMessage('计划结束日期不能早于开始日期。')
      return
    }
    setValidationMessage('')
    mutation.mutate()
  }

  return (
    <form className="workspace-modal-form" onSubmit={submit} noValidate>
      <div className="workspace-modal-form__grid">
        <label htmlFor="details-project-code"><span>项目编号</span><Input id="details-project-code" value={code} onChange={setCode} /></label>
        <label htmlFor="details-project-name"><span>项目名称</span><Input id="details-project-name" value={name} onChange={setName} /></label>
      </div>
      <label htmlFor="details-project-objective"><span>项目目标</span><TextArea id="details-project-objective" value={objective} onChange={setObjective} autosize={{ minRows: 2, maxRows: 5 }} /></label>
      <label htmlFor="details-project-outcome"><span>预期成果</span><TextArea id="details-project-outcome" value={expectedOutcome} onChange={setExpectedOutcome} autosize={{ minRows: 2, maxRows: 4 }} /></label>
      <div className="workspace-modal-form__grid">
        <label htmlFor="details-project-direction"><span>研究方向</span><Input id="details-project-direction" value={researchDirection} onChange={setResearchDirection} /></label>
        <label htmlFor="details-project-lead"><span>负责人</span><Input id="details-project-lead" value={leadName} onChange={setLeadName} /></label>
      </div>
      <div className="workspace-modal-form__grid">
        <div className="workspace-modal-form__field" role="group" aria-labelledby="project-start-label"><span id="project-start-label">计划开始</span><DatePicker aria-labelledby="project-start-label" type="date" format="yyyy-MM-dd" value={plannedStartAt} onChange={(_, value) => setPlannedStartAt(String(value ?? ''))} style={{ width: '100%' }} showClear /></div>
        <div className="workspace-modal-form__field" role="group" aria-labelledby="project-end-label"><span id="project-end-label">计划结束</span><DatePicker aria-labelledby="project-end-label" type="date" format="yyyy-MM-dd" value={plannedEndAt} onChange={(_, value) => setPlannedEndAt(String(value ?? ''))} style={{ width: '100%' }} showClear /></div>
      </div>
      <div className="workspace-modal-form__grid workspace-modal-form__grid--three">
        <div className="workspace-modal-form__field" role="group" aria-labelledby="project-status-label"><span id="project-status-label">项目状态</span><Select aria-labelledby="project-status-label" value={status} onChange={(value) => setStatus(value as ProjectStatus)} optionList={STATUS_OPTIONS} style={{ width: '100%' }} /></div>
        <div className="workspace-modal-form__field" role="group" aria-labelledby="project-phase-label"><span id="project-phase-label">项目阶段</span><Select aria-labelledby="project-phase-label" value={phase} onChange={(value) => setPhase(value as ProjectPhase)} optionList={PHASE_OPTIONS} style={{ width: '100%' }} /></div>
        <div className="workspace-modal-form__field" role="group" aria-labelledby="project-health-label"><span id="project-health-label">健康度</span><Select aria-labelledby="project-health-label" value={health} onChange={(value) => setHealth(value as ProjectHealth | 'AUTO')} optionList={HEALTH_OPTIONS} style={{ width: '100%' }} /></div>
      </div>
      <div className="workspace-modal-form__field" role="group" aria-labelledby="project-weight-mode-label">
        <span id="project-weight-mode-label">里程碑权重方式</span>
        <Select
          aria-labelledby="project-weight-mode-label"
          value={weightMode}
          onChange={(value) => setWeightMode(value as ProjectWeightMode)}
          optionList={WEIGHT_MODE_OPTIONS}
          style={{ width: '100%' }}
        />
        <small>
          {weightMode === 'EQUAL'
            ? '项目进度按所有里程碑平均计算。'
            : '保存前请确保所有里程碑权重合计为 100%。'}
        </small>
      </div>
      {validationMessage ? <p className="workspace-modal-form__error" role="alert">{validationMessage}</p> : null}
      <div className="workspace-modal-form__actions"><Button htmlType="submit" theme="solid" type="primary" loading={mutation.isPending}>保存项目</Button></div>
    </form>
  )
}
