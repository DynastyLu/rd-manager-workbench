import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createMeeting, listMeetings } from '@/modules/workbench/api/management'
import {
  ManagementEmpty,
  ManagementError,
  ManagementLoading,
} from '@/modules/workbench/components/management/ManagementState'

export function MeetingsWorkspace() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const meetingsQuery = useQuery({
    queryKey: ['meetings', { projectId }],
    queryFn: () => listMeetings({ projectId }),
  })
  const createMeetingMutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form)
      const title = data.get('title')
      const scheduledAt = data.get('scheduledAt')

      if (typeof title !== 'string' || typeof scheduledAt !== 'string') {
        throw new Error('会议标题和时间不能为空')
      }

      return createMeeting({
        title,
        scheduledAt: new Date(scheduledAt).toISOString(),
        ...(projectId ? { projectId } : {}),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meetings'] })
      setOpen(false)
    },
  })

  return (
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide">
        <header className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Management Loop</p>
            <h2 className="app-page__title">会议与行动项</h2>
            <p className="app-page__subtitle">议程、纪要、决策、行动项与可追溯的任务转换。</p>
            {projectId ? (
              <p className="mt-2 text-sm text-muted-foreground">当前仅显示本项目会议</p>
            ) : null}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>新建会议</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建会议</DialogTitle>
                <DialogDescription>
                  {projectId ? '该会议将自动关联当前项目。' : '设置会议主题与开始时间。'}
                </DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  createMeetingMutation.mutate(event.currentTarget)
                }}
              >
                <Input required name="title" placeholder="会议标题" />
                <Input required name="scheduledAt" type="datetime-local" />
                <Button disabled={createMeetingMutation.isPending}>保存会议</Button>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {meetingsQuery.isPending ? <ManagementLoading label="会议" /> : null}
        {meetingsQuery.isError ? (
          <ManagementError label="会议" retry={() => void meetingsQuery.refetch()} />
        ) : null}
        {meetingsQuery.data ? (
          meetingsQuery.data.data.length ? (
            <section className="grid gap-3">
              {meetingsQuery.data.data.map((meeting) => (
                <Card key={meeting.id}>
                  <CardHeader>
                    <CardTitle>{meeting.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    时间：{meeting.scheduledAt.slice(0, 16)} · 状态：{meeting.status}
                    <p className="mt-2">
                      会议详情包含议题、纪要、决策和行动项；行动项可生成来源任务。
                    </p>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : (
            <ManagementEmpty label="会议" />
          )
        ) : null}
      </div>
    </div>
  )
}

export default MeetingsWorkspace
