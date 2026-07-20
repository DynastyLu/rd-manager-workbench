import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'
import { createIssue, getIssue, listIssues } from '@/modules/workbench/api/management'
import {
  ManagementEmpty,
  ManagementError,
  ManagementLoading,
} from '@/modules/workbench/components/management/ManagementState'

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
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide">
        <header className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Management Loop</p>
            <h1 className="app-page__title">问题与阻塞</h1>
            <p className="app-page__subtitle">记录影响对象、解决方案、期限与验证结果。</p>
          </div>
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
                <Button disabled={createMutation.isPending}>保存问题</Button>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {focusedIssueQuery.data ? (
          <section aria-label="当前定位问题">
            <Card className="mb-4 border-blue-300 bg-blue-50/50">
              <CardHeader>
                <p className="text-xs font-semibold text-blue-700">当前定位</p>
                <CardTitle>{focusedIssueQuery.data.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                状态：{focusedIssueQuery.data.status} · 负责人：
                {focusedIssueQuery.data.ownerName ?? '未指定'}
              </CardContent>
            </Card>
          </section>
        ) : null}

        <Button
          variant={overdue ? 'default' : 'outline'}
          onClick={() => setOverdue((value) => !value)}
          className="mb-4"
        >
          {overdue ? '仅显示逾期' : '筛选逾期'}
        </Button>
        {issuesQuery.isPending ? <ManagementLoading label="问题" /> : null}
        {issuesQuery.isError ? (
          <ManagementError label="问题" retry={() => void issuesQuery.refetch()} />
        ) : null}
        {issuesQuery.data ? (
          issuesQuery.data.data.length ? (
            <section className="grid gap-3">
              {issuesQuery.data.data.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    状态：{item.status} · 截止：{item.dueAt?.slice(0, 10) ?? '未设定'}
                    <p className="mt-2">关闭时需要记录验证结果。</p>
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
