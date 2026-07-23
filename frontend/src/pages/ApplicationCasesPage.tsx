import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/workspace/SemiCompat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/workspace/SemiCompat'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/workspace/SemiCompat'
import { Input } from '@/components/workspace/SemiCompat'
import { Skeleton } from '@/components/workspace/SemiCompat'
import {
  createApplicationCase,
  getApplicationCase,
  listApplicationCases,
  listWorkflowTemplates,
  updateApplicationNode,
} from '@/modules/workbench/api/applications'
import { ApplicationCaseForm } from '@/modules/workbench/components/ApplicationCaseForm'
import { ApplicationCaseWorkspace } from '@/modules/workbench/components/ApplicationCaseWorkspace'

export default function ApplicationCasesPage() {
  const [searchParams] = useSearchParams()
  const deepLinkedCaseId = searchParams.get('caseId')?.trim() || null
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(deepLinkedCaseId)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const casesQuery = useQuery({
    queryKey: ['application-cases', { search }],
    queryFn: () => listApplicationCases({ search: search || undefined }),
  })
  const templatesQuery = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: () => listWorkflowTemplates({ pageSize: 100 }),
  })
  const selectedCaseQuery = useQuery({
    queryKey: ['application-case', selectedCaseId],
    queryFn: () => getApplicationCase(selectedCaseId!),
    enabled: selectedCaseId !== null,
  })
  const createMutation = useMutation({
    mutationFn: createApplicationCase,
    onSuccess: async (applicationCase) => {
      await queryClient.invalidateQueries({ queryKey: ['application-cases'] })
      setSelectedCaseId(applicationCase.id)
      setIsCreateOpen(false)
      toast.success('申报案件已创建')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '创建申报案件失败，请重试。')
    },
  })
  const completeNodeMutation = useMutation({
    mutationFn: ({ caseId, nodeId }: { caseId: string; nodeId: string }) =>
      updateApplicationNode(caseId, nodeId, { status: 'COMPLETED' }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['application-case', variables.caseId] }),
        queryClient.invalidateQueries({ queryKey: ['application-cases'] }),
      ])
    },
  })

  return (
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Application Dossier</p>
            <h1 className="app-page__title">申报认定</h1>
            <p className="app-page__subtitle">用可配置流程管理条件、材料版本、证据、补正与提交。</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild><Button>新建案件</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建申报案件</DialogTitle>
                <DialogDescription>案件会复制所选流程模板的节点快照，后续模板变更不会改写历史。</DialogDescription>
              </DialogHeader>
              <ApplicationCaseForm
                templates={templatesQuery.data?.data ?? []}
                isSubmitting={createMutation.isPending}
                onSubmit={createMutation.mutateAsync}
              />
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-4">
            <Input
              aria-label="筛选申报案件"
              placeholder="按案件名称或编号筛选"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </CardContent>
        </Card>

        {casesQuery.isPending ? (
          <Card aria-busy="true" aria-label="正在加载申报案件"><CardContent className="grid gap-3 pt-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : null}
        {casesQuery.isError ? (
          <Card><CardHeader><CardTitle>无法读取申报案件</CardTitle><CardDescription>请确认本地服务已启动后重试。</CardDescription></CardHeader><CardContent><Button onClick={() => void casesQuery.refetch()}>重试</Button></CardContent></Card>
        ) : null}
        {casesQuery.data ? (
          casesQuery.data.data.length || selectedCaseId ? (
            <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
              <Card>
                <CardHeader><CardTitle>案件列表</CardTitle></CardHeader>
                <CardContent className="grid gap-2">
                  {casesQuery.data.data.map((applicationCase) => (
                    <Button
                      key={applicationCase.id}
                      variant={applicationCase.id === selectedCaseId ? 'default' : 'outline'}
                      className="h-auto justify-start py-3 text-left"
                      onClick={() => setSelectedCaseId(applicationCase.id)}
                    >
                      <span><span className="block font-medium">{applicationCase.title}</span><span className="block text-xs opacity-70">{applicationCase.code} · {applicationCase.status}</span></span>
                    </Button>
                  ))}
                </CardContent>
              </Card>
              {selectedCaseQuery.isPending ? <Card aria-busy="true"><CardContent className="pt-4"><Skeleton className="h-72 w-full" /></CardContent></Card> : null}
              {selectedCaseQuery.isError ? <Card><CardHeader><CardTitle>无法读取案件详情</CardTitle></CardHeader><CardContent><Button onClick={() => void selectedCaseQuery.refetch()}>重试</Button></CardContent></Card> : null}
              {selectedCaseQuery.data ? (
                <ApplicationCaseWorkspace
                  applicationCase={selectedCaseQuery.data}
                  isUpdatingNode={completeNodeMutation.isPending}
                  onCompleteNode={(node) => completeNodeMutation.mutateAsync({ caseId: selectedCaseQuery.data.id, nodeId: node.id }).then(() => undefined)}
                />
              ) : null}
              {selectedCaseId === null ? <Card><CardHeader><CardTitle>选择一个案件查看详情</CardTitle></CardHeader></Card> : null}
            </div>
          ) : <Card><CardHeader><CardTitle>还没有申报案件，先创建一个案件吧。</CardTitle></CardHeader></Card>
        ) : null}
      </div>
    </div>
  )
}
