import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/workspace/SemiCompat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/workspace/SemiCompat'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/workspace/SemiCompat'
import { Input } from '@/components/workspace/SemiCompat'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'
import { createIssue, getIssue, listIssues } from '@/modules/workbench/api/management'
import {
  ManagementEmpty,
  ManagementError,
  ManagementLoading,
} from '@/modules/workbench/components/management/ManagementState'
import './IssuesPage.less'

export default function IssuesPage() {
  const [searchParams] = useSearchParams()
  const recordId = searchParams.get('recordId')?.trim() || undefined
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const [overdue, setOverdue] = useState(false)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const issuesQuery = useQuery({
    queryKey: ['issues', { overdue, projectId }],
    queryFn: () => listIssues({ overdue, projectId }),
  })
  const focusedIssueQuery = useQuery({
    queryKey: ['issue', recordId],
    queryFn: () => getIssue(recordId!),
    enabled: Boolean(recordId),
  })
  const createMutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form)
      const title = data.get('title')
      const dueAt = data.get('dueAt')
      return createIssue({
        title: typeof title === 'string' ? title : '',
        dueAt: typeof dueAt === 'string' && dueAt ? dueAt : undefined,
        projectId,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['issues'] })
      setOpen(false)
    },
  })

  return (
    <div className="issues-page workspace-page">
      <div className="issues-page__inner workspace-page__inner">
        <div className="workspace-module-toolbar">
          <div className="workspace-module-toolbar__actions">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>新建问题</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建问题</DialogTitle>
              </DialogHeader>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  createMutation.mutate(event.currentTarget)
                }}
              >
                <Input required name="title" placeholder="问题标题" />
                <DateTimePickerField name="dueAt" aria-label="问题截止时间" />
                <Button type="submit" disabled={createMutation.isPending}>保存问题</Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {focusedIssueQuery.data ? (
          <section aria-label="当前定位问题">
            <Card className="workspace-card issues-page__focus-card">
              <CardHeader>
                <p className="issues-page__focus-label">当前定位</p>
                <CardTitle>{focusedIssueQuery.data.title}</CardTitle>
              </CardHeader>
              <CardContent className="issues-page__focus-meta">
                状态：{focusedIssueQuery.data.status} · 负责人：
                {focusedIssueQuery.data.ownerName ?? '未指定'}
              </CardContent>
            </Card>
          </section>
        ) : null}

        <Card className="workspace-card">
          <CardContent className="pt-4">
            <Button
              variant={overdue ? 'default' : 'outline'}
              onClick={() => setOverdue((value) => !value)}
            >
              {overdue ? '仅显示逾期' : '筛选逾期'}
            </Button>
          </CardContent>
        </Card>
        {issuesQuery.isPending ? <ManagementLoading label="问题" /> : null}
        {issuesQuery.isError ? (
          <ManagementError label="问题" retry={() => void issuesQuery.refetch()} />
        ) : null}
        {issuesQuery.data ? (
          issuesQuery.data.data.length ? (
            <section className="issues-page__list">
              {issuesQuery.data.data.map((item) => (
                <Card key={item.id} className="workspace-card issues-page__card">
                  <CardHeader>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="issues-page__card-meta">
                    状态：{item.status} · 截止：{item.dueAt?.slice(0, 10) ?? '未设定'}
                    <p>关闭时需要记录验证结果。</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : (
            <ManagementEmpty label="问题" />
          )
        ) : null}
      </div>
    </div>
  )
}
