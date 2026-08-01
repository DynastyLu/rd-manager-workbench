/* eslint-disable @typescript-eslint/no-base-to-string */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/workspace/SemiCompat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/workspace/SemiCompat'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/workspace/SemiCompat'
import { Input } from '@/components/workspace/SemiCompat'
import { createDecision, getDecision, listDecisions } from '@/modules/workbench/api/management'
import { ManagementEmpty, ManagementError, ManagementLoading } from '@/modules/workbench/components/management/ManagementState'
import './DecisionsPage.less'

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
    <div className="decisions-page workspace-page">
      <div className="decisions-page__inner workspace-page__inner">
        <header className="decisions-page__header">
          <div>
            <h1>决策对象库</h1>
            <p>沉淀背景、备选方案、依据、结论与后续任务。</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>新建决策</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>新建决策</DialogTitle></DialogHeader>
              <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(event.currentTarget) }}>
                <Input name="title" required placeholder="决策标题" />
                <textarea name="alternatives" required className="min-h-24 rounded-md border bg-transparent p-2 text-sm" placeholder="每行一项备选方案" />
                <Button type="submit" disabled={createMutation.isPending}>保存决策</Button>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {focusedDecisionQuery.data ? (
          <section aria-label="当前定位决策">
            <Card className="workspace-card decisions-page__focus-card">
              <CardHeader>
                <p className="decisions-page__focus-label">当前定位</p>
                <CardTitle>{focusedDecisionQuery.data.title}</CardTitle>
              </CardHeader>
              <CardContent className="decisions-page__focus-meta">
                状态：{focusedDecisionQuery.data.status} · 方案：{focusedDecisionQuery.data.alternatives.join(' / ')}
              </CardContent>
            </Card>
          </section>
        ) : null}

        {decisionsQuery.isPending ? <ManagementLoading label="决策" /> : null}
        {decisionsQuery.isError ? <ManagementError label="决策" retry={() => void decisionsQuery.refetch()} /> : null}
        {decisionsQuery.data ? (
          decisionsQuery.data.data.length ? (
            <section className="decisions-page__list">
              {decisionsQuery.data.data.map((item) => (
                <Card key={item.id} className="workspace-card decisions-page__card">
                  <CardHeader><CardTitle>{item.title}</CardTitle></CardHeader>
                  <CardContent className="decisions-page__card-meta">
                    状态：{item.status} · 方案：{item.alternatives.join(' / ')}
                    <p>详情中可一键生成保留决策来源的后续任务。</p>
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
