import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProject, updateProject } from '@/modules/workbench/api/projects'
import type { Project } from '@/modules/workbench/types'

interface ProjectFormProps {
  project?: Project
  onSuccess?: (project: Project) => void
}

interface ProjectValues {
  code: string
  name: string
}

export function ProjectForm({ project, onSuccess }: ProjectFormProps) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState(project?.code ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [validationMessage, setValidationMessage] = useState('')

  const mutation = useMutation({
    mutationFn: (values: ProjectValues) =>
      project ? updateProject(project.id, values) : createProject(values),
    onSuccess: async (savedProject) => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]
      if (project) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['project', project.id] }))
      }
      await Promise.all(invalidations)
      toast.success(project ? '项目已更新' : '项目已创建')
      onSuccess?.(savedProject)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存项目失败，请重试。')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const values = { code: code.trim(), name: name.trim() }
    if (!values.code || !values.name) {
      setValidationMessage('请填写项目编号和项目名称。')
      return
    }

    setValidationMessage('')
    mutation.mutate(values)
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="project-code">项目编号</Label>
        <Input
          id="project-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={mutation.isPending}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-name">项目名称</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={mutation.isPending}
        />
      </div>
      {validationMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {validationMessage}
        </p>
      ) : null}
      <Button type="submit" disabled={mutation.isPending}>
        保存项目
      </Button>
    </form>
  )
}
