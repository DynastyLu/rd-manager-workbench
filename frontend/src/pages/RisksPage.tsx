import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Tag } from '@douyinfe/semi-ui'
import { Button } from '@/components/workspace/SemiCompat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/workspace/SemiCompat'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/workspace/SemiCompat'
import { Input } from '@/components/workspace/SemiCompat'
import { WorkspaceSelect } from '@/components/workspace/WorkspaceSelect'
import { createRisk, getRisk, listRisks } from '@/modules/workbench/api/management'
import {
  ManagementEmpty,
  ManagementError,
  ManagementLoading,
} from '@/modules/workbench/components/management/ManagementState'
import type { RiskLevel, RiskStatus } from '@/modules/workbench/types'
import './RisksPage.less'

const RISK_LEVEL_META: Record<RiskLevel, { label: string; color: 'green' | 'amber' | 'red' }> = {
  LOW: { label: '低风险', color: 'green' },
  MEDIUM: { label: '中风险', color: 'amber' },
  HIGH: { label: '高风险', color: 'red' },
  CRITICAL: { label: '严重风险', color: 'red' },
}

function RiskLevelTag({ level }: { level: RiskLevel }) {
  const meta = RISK_LEVEL_META[level]
  return <Tag color={meta.color}>{meta.label}</Tag>
}

export default function RisksPage() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const recordId = searchParams.get('recordId')?.trim() || undefined
  const [status, setStatus] = useState<RiskStatus | undefined>()
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState<RiskLevel>('MEDIUM')
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
        likelihood: level === 'LOW' ? 'LOW' : level === 'MEDIUM' ? 'MEDIUM' : 'HIGH',
        impact: level === 'CRITICAL' ? 'CRITICAL' : level,
        level,
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
    <div className="risks-page workspace-page">
      <div className="risks-page__inner workspace-page__inner">
        <div className="workspace-module-toolbar">
          {projectId ? <span className="risks-page__scope">当前仅显示本项目风险</span> : <span />}
          <div className="workspace-module-toolbar__actions">
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
                <WorkspaceSelect
                  aria-label="风险等级"
                  value={level}
                  onChange={(value) => setLevel(value as RiskLevel)}
                  options={Object.entries(RISK_LEVEL_META).map(([value, meta]) => ({
                    value: value as RiskLevel,
                    label: meta.label,
                  }))}
                />
                <Button type="submit" disabled={createRiskMutation.isPending}>保存风险</Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {focusedRiskQuery.data ? (
          <section aria-label="当前定位风险">
            <Card className="workspace-card risks-page__focus-card">
              <CardHeader>
                <p className="risks-page__focus-label">当前定位</p>
                <CardTitle>{focusedRiskQuery.data.title}</CardTitle>
              </CardHeader>
              <CardContent className="risks-page__focus-meta">
                <RiskLevelTag level={focusedRiskQuery.data.level} /> · 状态：{focusedRiskQuery.data.status} · 负责人：
                {focusedRiskQuery.data.ownerName ?? '未指定'}
              </CardContent>
            </Card>
          </section>
        ) : null}

        <Card className="workspace-card">
          <CardContent className="pt-4">
            <WorkspaceSelect
              aria-label="按风险状态筛选"
              value={status ?? 'ALL'}
              onChange={(value) =>
                setStatus(value === 'ALL' ? undefined : (value as RiskStatus))
              }
              options={[
                { value: 'ALL', label: '全部状态' },
                { value: 'OPEN', label: '未关闭' },
                { value: 'MITIGATING', label: '处理中' },
                { value: 'CLOSED', label: '已关闭' },
              ]}
            />
          </CardContent>
        </Card>

        {risksQuery.isPending ? <ManagementLoading label="风险" /> : null}
        {risksQuery.isError ? (
          <ManagementError label="风险" retry={() => void risksQuery.refetch()} />
        ) : null}
        {risksQuery.data ? (
          risksQuery.data.data.length ? (
            <section className="risks-page__list">
              {risksQuery.data.data.map((risk) => (
                <Card key={risk.id} className="workspace-card risks-page__card">
                  <CardHeader>
                    <CardTitle>{risk.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="risks-page__card-meta">
                    <RiskLevelTag level={risk.level} /> · 状态：{risk.status} · 负责人：
                    {risk.ownerName ?? '未指定'}
                    <p>详情可继续关联任务、项目和处置记录。</p>
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
