import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button, Input, Select, TextArea } from '@douyinfe/semi-ui'
import { createProgressReport, updateProgressReport } from '@/modules/workbench/api/projects'
import type { Milestone, ProgressReport } from '@/modules/workbench/types'

interface ProgressReportFormProps {
  projectId: string
  onSuccess?: (report: ProgressReport) => void
  report?: ProgressReport
  milestones?: Milestone[]
}

export function ProgressReportForm({ projectId, onSuccess, report, milestones = [] }: ProgressReportFormProps) {
  const queryClient = useQueryClient()
  const [summary, setSummary] = useState(report?.summary ?? '')
  const [milestoneId, setMilestoneId] = useState(report?.milestoneId ?? '')
  const [completedResults, setCompletedResults] = useState(report?.completedResults ?? '')
  const [blockers, setBlockers] = useState(report?.blockers ?? '')
  const [nextSteps, setNextSteps] = useState(report?.nextSteps ?? '')
  const [validationMessage, setValidationMessage] = useState('')
  const mutation = useMutation({
    mutationFn: ({
      projectId: targetProjectId,
      input,
    }: {
      projectId: string
      input: Parameters<typeof createProgressReport>[1]
    }) => report
      ? updateProgressReport(targetProjectId, report.id, input)
      : createProgressReport(targetProjectId, input),
    onSuccess: async (report) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success(report ? '项目进展已更新' : '项目进展已提交')
      onSuccess?.(report)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '提交进展失败，请重试。')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedSummary = summary.trim()
    if (!trimmedSummary) {
      setValidationMessage('请填写进展摘要。')
      return
    }
    setValidationMessage('')
    mutation.mutate({
      projectId,
      input: {
        summary: trimmedSummary,
        reportedAt: new Date().toISOString(),
        ...(milestoneId ? { milestoneId } : {}),
        ...(completedResults.trim() ? { completedResults: completedResults.trim() } : {}),
        ...(blockers.trim() ? { blockers: blockers.trim() } : {}),
        ...(nextSteps.trim() ? { nextSteps: nextSteps.trim() } : {}),
      },
    })
  }

  return (
    <form className="workspace-modal-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="progress-summary">
        <span>进展摘要</span>
        <Input
          id="progress-summary"
          value={summary}
          onChange={setSummary}
          disabled={mutation.isPending}
        />
      </label>
      <div className="workspace-modal-form__field" role="group" aria-labelledby="progress-milestone-label">
        <span id="progress-milestone-label">关联里程碑（可选）</span>
        <Select
          aria-labelledby="progress-milestone-label"
          value={milestoneId}
          onChange={(value) => setMilestoneId(String(value ?? ''))}
          optionList={[
            { value: '', label: '不关联里程碑' },
            ...milestones.map((milestone) => ({ value: milestone.id, label: milestone.name })),
          ]}
          style={{ width: '100%' }}
        />
      </div>
      <label htmlFor="progress-results">
        <span>已完成成果（可选）</span>
        <TextArea
          id="progress-results"
          value={completedResults}
          onChange={setCompletedResults}
          disabled={mutation.isPending}
          autosize={{ minRows: 2, maxRows: 5 }}
        />
      </label>
      <label htmlFor="progress-blockers">
        <span>当前阻塞（可选）</span>
        <TextArea
          id="progress-blockers"
          value={blockers}
          onChange={setBlockers}
          disabled={mutation.isPending}
          autosize={{ minRows: 2, maxRows: 5 }}
        />
      </label>
      <label htmlFor="progress-next-steps">
        <span>下一步计划（可选）</span>
        <TextArea
          id="progress-next-steps"
          value={nextSteps}
          onChange={setNextSteps}
          disabled={mutation.isPending}
          autosize={{ minRows: 2, maxRows: 5 }}
        />
      </label>
      {validationMessage ? <p role="alert" className="workspace-modal-form__error">{validationMessage}</p> : null}
      <div className="workspace-modal-form__actions">
        <Button htmlType="submit" theme="solid" type="primary" loading={mutation.isPending}>
          {report ? '保存修改' : '保存进展'}
        </Button>
      </div>
    </form>
  )
}
