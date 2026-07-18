import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ApplicationCase, ApplicationNode } from '@/modules/workbench/types'

interface ApplicationCaseWorkspaceProps {
  applicationCase: ApplicationCase
  onCompleteNode: (node: ApplicationNode) => Promise<void>
  isUpdatingNode?: boolean
}

const nodeStatusLabel: Record<ApplicationNode['status'], string> = {
  PENDING: '待开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  SKIPPED: '已跳过',
}

function formatDate(value: string | null): string {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}

function EmptySection({ message }: { message: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{message}</p>
}

export function ApplicationCaseWorkspace({
  applicationCase,
  onCompleteNode,
  isUpdatingNode = false,
}: ApplicationCaseWorkspaceProps) {
  const [completionError, setCompletionError] = useState('')

  async function handleCompleteNode(node: ApplicationNode) {
    setCompletionError('')
    try {
      await onCompleteNode(node)
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : '节点完成失败，请检查必填项后重试。')
    }
  }

  const orderedNodes = [...applicationCase.nodes].sort((left, right) => left.sequence - right.sequence)

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{applicationCase.title}</CardTitle>
          <CardDescription>
            {applicationCase.code ?? '未设置编号'} · 当前状态：{applicationCase.status}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="申报流程节点">
            {orderedNodes.map((node) => (
              <li key={node.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{node.sequence}. {node.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nodeStatusLabel[node.status]}
                    </p>
                  </div>
                  <Badge variant={node.status === 'COMPLETED' ? 'secondary' : 'outline'}>
                    {nodeStatusLabel[node.status]}
                  </Badge>
                </div>
                {node.status !== 'COMPLETED' ? (
                  <Button
                    className="mt-3 w-full"
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingNode}
                    onClick={() => void handleCompleteNode(node)}
                    aria-label={`完成节点：${node.title}`}
                  >
                    标记完成
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
          {completionError ? <p className="mt-3 text-sm text-destructive" role="alert">{completionError}</p> : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="requirements">
        <TabsList aria-label="案件明细">
          <TabsTrigger value="requirements">条件</TabsTrigger>
          <TabsTrigger value="materials">材料与版本</TabsTrigger>
          <TabsTrigger value="evidence">证据</TabsTrigger>
          <TabsTrigger value="timeline">补正与提交</TabsTrigger>
        </TabsList>
        <TabsContent value="requirements">
          <Card>
            <CardHeader><CardTitle>申报条件</CardTitle></CardHeader>
            <CardContent>
              {applicationCase.requirements.length ? (
                <ul className="grid gap-2">
                  {applicationCase.requirements.map((requirement) => (
                    <li key={requirement.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <span>{requirement.title}{requirement.isRequired ? '（必填）' : ''}</span>
                      <Badge variant={requirement.status === 'SATISFIED' ? 'secondary' : 'outline'}>
                        {requirement.status === 'SATISFIED' ? '已满足' : requirement.status === 'NOT_APPLICABLE' ? '不适用' : '待核验'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : <EmptySection message="尚未配置申报条件。" />}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="materials">
          <Card>
            <CardHeader><CardTitle>材料版本</CardTitle></CardHeader>
            <CardContent>
              {applicationCase.materials.length ? (
                <ul className="grid gap-2">
                  {applicationCase.materials.map((material) => (
                    <li key={material.id} className="rounded-md border p-3">
                      <p className="font-medium">{material.title}{material.isRequired ? '（必需）' : ''}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {material.versions.length ? `已有 ${material.versions.length} 个版本` : '尚无版本'}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <EmptySection message="尚未建立申报材料。" />}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="evidence">
          <Card>
            <CardHeader><CardTitle>证据记录</CardTitle></CardHeader>
            <CardContent>
              {applicationCase.evidenceRecords.length ? (
                <ul className="grid gap-2">
                  {applicationCase.evidenceRecords.map((record) => (
                    <li key={record.id} className="rounded-md border p-3">
                      <p className="font-medium">{record.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{record.description ?? '无说明'}</p>
                    </li>
                  ))}
                </ul>
              ) : <EmptySection message="尚未关联证据记录。" />}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle>补正与提交时间线</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              {applicationCase.corrections.length ? (
                <section aria-label="补正记录">
                  <p className="mb-2 text-sm font-medium">补正记录</p>
                  <ul className="grid gap-2">
                    {applicationCase.corrections.map((correction) => (
                      <li key={correction.id} className="rounded-md border p-3">
                        {correction.title} · {correction.status === 'RESOLVED' ? '已解决' : '待处理'}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {applicationCase.submissions.length ? (
                <section aria-label="提交记录">
                  <p className="mb-2 text-sm font-medium">提交记录</p>
                  <ul className="grid gap-2">
                    {applicationCase.submissions.map((submission) => (
                      <li key={submission.id} className="rounded-md border p-3">
                        {submission.status} · {formatDate(submission.submittedAt)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {!applicationCase.corrections.length && !applicationCase.submissions.length ? (
                <EmptySection message="尚无补正或提交记录。" />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
