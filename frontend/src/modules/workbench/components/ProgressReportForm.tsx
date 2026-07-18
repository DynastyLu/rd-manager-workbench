import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProgressReport } from '@/modules/workbench/api/projects'
import type { ProgressReport } from '@/modules/workbench/types'

interface ProgressReportFormProps {
  projectId: string
  onSuccess?: (report: ProgressReport) => void
}

export function ProgressReportForm({ projectId, onSuccess }: ProgressReportFormProps) {
  const queryClient = useQueryClient()
  const [summary, setSummary] = useState('')
  const [completionPercent, setCompletionPercent] = useState('0')
  const [blockers, setBlockers] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const mutation = useMutation({
    mutationFn: ({
      projectId: targetProjectId,
      input,
    }: {
      projectId: string
      input: Parameters<typeof createProgressReport>[1]
    }) => createProgressReport(targetProjectId, input),
    onSuccess: async (report) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success('项目进展已提交')
      onSuccess?.(report)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '提交进展失败，请重试。')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedSummary = summary.trim()
    const percent = Number(completionPercent)
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
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="progress-summary">进展摘要</Label>
        <Input
          id="progress-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          disabled={mutation.isPending}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="progress-percent">完成百分比</Label>
        <Input
          id="progress-percent"
          type="number"
          min={0}
          max={100}
          step={1}
          value={completionPercent}
          onChange={(event) => setCompletionPercent(event.target.value)}
          disabled={mutation.isPending}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="progress-blockers">当前阻塞（可选）</Label>
        <Input
          id="progress-blockers"
          value={blockers}
          onChange={(event) => setBlockers(event.target.value)}
          disabled={mutation.isPending}
        />
      </div>
      {validationMessage ? <p role="alert" className="text-sm text-destructive">{validationMessage}</p> : null}
      <Button type="submit" disabled={mutation.isPending}>保存进展</Button>
    </form>
  )
}
