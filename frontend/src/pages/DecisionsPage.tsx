/* eslint-disable @typescript-eslint/no-base-to-string */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createDecision, getDecision, listDecisions } from '@/modules/workbench/api/management'
import { ManagementEmpty, ManagementError, ManagementLoading } from '@/modules/workbench/components/management/ManagementState'

export default function DecisionsPage() {
  const [open, setOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const recordId = searchParams.get('recordId')?.trim() || undefined
  const decisionsQuery = useQuery({ queryKey: ['decisions'], queryFn: () => listDecisions() })
  const focusedDecisionQuery = useQuery({
    queryKey: ['decision', recordId],
    queryFn: () => getDecision(recordId!),
    enabled: Boolean(recordId),
  })
  const queryClient = useQueryClient()
  const createMutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form)
      return createDecision({
        title: String(data.get('title')),
        alternatives: String(data.get('alternatives')).split('\n').map((item) => item.trim()).filter(Boolean),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['decisions'] })
      setOpen(false)
    },
  })

  return (
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide">
        <header className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Management Loop</p>
            <h1 className="app-page__title">决策对象库</h1>
            <p className="app-page__subtitle">沉淀背景、备选方案、依据、结论与后续任务。</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>新建决策</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>新建决策</DialogTitle></DialogHeader>
              <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(event.currentTarget) }}>
                <Input name="title" required placeholder="决策标题" />
                <textarea name="alternatives" required className="min-h-24 rounded-md border bg-transparent p-2 text-sm" placeholder="每行一项备选方案" />
                <Button disabled={createMutation.isPending}>保存决策</Button>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {focusedDecisionQuery.data ? (
          <section aria-label="当前定位决策">
            <Card className="mb-4 border-blue-300 bg-blue-50/50">
              <CardHeader>
                <p className="text-xs font-semibold text-blue-700">当前定位</p>
                <CardTitle>{focusedDecisionQuery.data.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                状态：{focusedDecisionQuery.data.status} · 方案：{focusedDecisionQuery.data.alternatives.join(' / ')}
              </CardContent>
            </Card>
          </section>
        ) : null}

        {decisionsQuery.isPending ? <ManagementLoading label="决策" /> : null}
        {decisionsQuery.isError ? <ManagementError label="决策" retry={() => void decisionsQuery.refetch()} /> : null}
        {decisionsQuery.data ? (
          decisionsQuery.data.data.length ? (
            <section className="grid gap-3">
              {decisionsQuery.data.data.map((item) => (
                <Card key={item.id}>
                  <CardHeader><CardTitle>{item.title}</CardTitle></CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    状态：{item.status} · 方案：{item.alternatives.join(' / ')}
                    <p className="mt-2">详情中可一键生成保留决策来源的后续任务。</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : <ManagementEmpty label="决策" />
        ) : null}
      </div>
    </div>
  )
}
