import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button, Input, InputNumber, TextArea } from '@douyinfe/semi-ui'
import { createProgressReport, updateProgressReport } from '@/modules/workbench/api/projects'
import type { ProgressReport } from '@/modules/workbench/types'

interface ProgressReportFormProps {
  projectId: string
  onSuccess?: (report: ProgressReport) => void
  report?: ProgressReport
}

export function ProgressReportForm({ projectId, onSuccess, report }: ProgressReportFormProps) {
  const queryClient = useQueryClient()
  const [summary, setSummary] = useState(report?.summary ?? '')
  const [completionPercent, setCompletionPercent] = useState(report?.completionPercent ?? 0)
  const [blockers, setBlockers] = useState(report?.blockers ?? '')
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
    const percent = completionPercent
    if (!trimmedSummary) {
      setValidationMessage('请填写进展摘要。')
      return
    }
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      setValidationMessage('完成百分比必须是 0 到 100 的整数。')
      return
    }
    setValidationMessage('')
    mutation.mutate({
      projectId,
      input: {
        summary: trimmedSummary,
        completionPercent: percent,
        reportedAt: new Date().toISOString(),
        ...(blockers.trim() ? { blockers: blockers.trim() } : {}),
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
      <label htmlFor="progress-percent">
        <span>完成百分比</span>
        <InputNumber
          id="progress-percent"
          aria-label="完成百分比"
          min={0}
          max={100}
          value={completionPercent}
          suffix="%"
          onNumberChange={(value) => setCompletionPercent(Number(value ?? 0))}
          disabled={mutation.isPending}
          style={{ width: '100%' }}
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
      {validationMessage ? <p role="alert" className="workspace-modal-form__error">{validationMessage}</p> : null}
      <div className="workspace-modal-form__actions">
        <Button htmlType="submit" theme="solid" type="primary" loading={mutation.isPending}>
          {report ? '保存修改' : '保存进展'}
        </Button>
      </div>
    </form>
  )
}
