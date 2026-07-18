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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createRisk, getRisk, listRisks } from '@/modules/workbench/api/management'
import {
  ManagementEmpty,
  ManagementError,
  ManagementLoading,
} from '@/modules/workbench/components/management/ManagementState'
import type { RiskStatus } from '@/modules/workbench/types'

export default function RisksPage() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const recordId = searchParams.get('recordId')?.trim() || undefined
  const [status, setStatus] = useState<RiskStatus | undefined>()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const risksQuery = useQuery({
    queryKey: ['risks', { projectId, status }],
    queryFn: () => listRisks({ projectId, status }),
  })
  const focusedRiskQuery = useQuery({
    queryKey: ['risk', recordId],
    queryFn: () => getRisk(recordId!),
    enabled: Boolean(recordId),
  })
  const createRiskMutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form)

      return createRisk({
        title: data.get('title') as string,
        likelihood: 'HIGH',
        impact: 'HIGH',
        level: 'HIGH',
        ownerName: (data.get('ownerName') as string) || undefined,
        ...(projectId ? { projectId } : {}),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['risks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      setOpen(false)
    },
  })

  return (
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide">
        <header className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Management Loop</p>
            <h1 className="app-page__title">风险对象库</h1>
            <p className="app-page__subtitle">
              按状态筛选未关闭风险；高风险会实时影响关联项目健康度。
            </p>
            {projectId ? (
              <p className="mt-2 text-sm text-muted-foreground">当前仅显示本项目风险</p>
            ) : null}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>新建风险</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建风险</DialogTitle>
                <DialogDescription>
                  {projectId ? '该风险将自动关联当前项目。' : '记录风险及其负责人。'}
                </DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  createRiskMutation.mutate(event.currentTarget)
                }}
              >
                <Input name="title" required placeholder="风险标题" />
                <Input name="ownerName" placeholder="责任人" />
                <Button disabled={createRiskMutation.isPending}>保存风险</Button>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {focusedRiskQuery.data ? (
          <section aria-label="当前定位风险">
            <Card className="mb-4 border-blue-300 bg-blue-50/50">
              <CardHeader>
                <p className="text-xs font-semibold text-blue-700">当前定位</p>
                <CardTitle>{focusedRiskQuery.data.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                等级：{focusedRiskQuery.data.level} · 状态：{focusedRiskQuery.data.status} · 负责人：
                {focusedRiskQuery.data.ownerName ?? '未指定'}
              </CardContent>
            </Card>
          </section>
        ) : null}

        <Card className="mb-4">
          <CardContent className="pt-4">
            <Select
              value={status ?? 'ALL'}
              onValueChange={(value) =>
                setStatus(value === 'ALL' ? undefined : (value as RiskStatus))
              }
            >
              <SelectTrigger aria-label="按风险状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="OPEN">未关闭</SelectItem>
                <SelectItem value="MITIGATING">处理中</SelectItem>
                <SelectItem value="CLOSED">已关闭</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {risksQuery.isPending ? <ManagementLoading label="风险" /> : null}
        {risksQuery.isError ? (
          <ManagementError label="风险" retry={() => void risksQuery.refetch()} />
        ) : null}
        {risksQuery.data ? (
          risksQuery.data.data.length ? (
            <section className="grid gap-3">
              {risksQuery.data.data.map((risk) => (
                <Card key={risk.id}>
                  <CardHeader>
                    <CardTitle>{risk.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    等级：{risk.level} · 状态：{risk.status} · 负责人：
                    {risk.ownerName ?? '未指定'}
                    <p className="mt-2">详情可继续关联任务、项目和处置记录。</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : (
            <ManagementEmpty label="风险" />
          )
        ) : null}
      </div>
    </div>
  )
}
