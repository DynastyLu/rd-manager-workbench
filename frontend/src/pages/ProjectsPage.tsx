import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { HealthBadge } from '@/modules/workbench/components/HealthBadge'
import { ProjectForm } from '@/modules/workbench/components/ProjectForm'
import { listProjects } from '@/modules/workbench/api/projects'
import type { ProjectStatus } from '@/modules/workbench/types'

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '进行中' },
  { value: 'ON_HOLD', label: '已暂停' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

function projectStatusLabel(status: ProjectStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | undefined>()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const projectsQuery = useQuery({
    queryKey: ['projects', { search, status }],
    queryFn: () => listProjects({ search: search || undefined, status }),
  })

  return (
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Project Portfolio</p>
            <h1 className="app-page__title">项目</h1>
            <p className="app-page__subtitle">集中查看项目状态、负责人和健康度。</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>新建项目</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建项目</DialogTitle>
                <DialogDescription>先填写基础信息，后续可在项目详情中继续完善。</DialogDescription>
              </DialogHeader>
              <ProjectForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-4">
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <Input
              aria-label="筛选项目"
              placeholder="按项目编号或名称筛选"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={status ?? 'ALL'}
              onValueChange={(value) =>
                setStatus(value === 'ALL' ? undefined : (value as ProjectStatus))
              }
            >
              <SelectTrigger aria-label="按状态筛选">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {projectsQuery.isPending ? (
          <Card aria-busy="true" aria-label="正在加载项目">
            <CardContent className="grid gap-3 pt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ) : null}

        {projectsQuery.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>无法读取项目列表</CardTitle>
              <CardDescription>请确认本地服务已启动后重试。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void projectsQuery.refetch()}>重试</Button>
            </CardContent>
          </Card>
        ) : null}

        {projectsQuery.data ? (
          projectsQuery.data.data.length ? (
            <Card>
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>项目编号</TableHead>
                      <TableHead>项目名称</TableHead>
                      <TableHead>负责人</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>健康度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectsQuery.data.data.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.code}</TableCell>
                        <TableCell>{project.name}</TableCell>
                        <TableCell>{project.leadName ?? '未指定'}</TableCell>
                        <TableCell>{projectStatusLabel(project.status)}</TableCell>
                        <TableCell>
                          <HealthBadge health={project.health} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>还没有项目，先新建一个项目吧。</CardTitle>
              </CardHeader>
            </Card>
          )
        ) : null}
      </div>
    </div>
  )
}
