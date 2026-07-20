import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input } from '@douyinfe/semi-ui'
import { toast } from 'sonner'

import { createProject, updateProject } from '@/modules/workbench/api/projects'
import type { Project } from '@/modules/workbench/types'

interface ProjectFormProps {
  project?: Project
  onSuccess?: (project: Project) => void
  formId?: string
  showActions?: boolean
}

interface ProjectValues {
  code: string
  name: string
}

export function ProjectForm({
  project,
  onSuccess,
  formId = 'project-form',
  showActions = true,
}: ProjectFormProps) {
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
    <form id={formId} className="workspace-modal-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="project-code">
        <span>项目编号</span>
        <Input
          id="project-code"
          value={code}
          onChange={setCode}
          disabled={mutation.isPending}
          autoComplete="off"
          placeholder="例如：RD-2026-001"
        />
      </label>
      <label htmlFor="project-name">
        <span>项目名称</span>
        <Input
          id="project-name"
          value={name}
          onChange={setName}
          disabled={mutation.isPending}
          placeholder="输入清晰、可识别的项目名称"
        />
      </label>
      {validationMessage ? (
        <p className="workspace-modal-form__error" role="alert">
          {validationMessage}
        </p>
      ) : null}
      {showActions ? (
        <div className="workspace-modal-form__actions">
          <Button htmlType="submit" theme="solid" type="primary" loading={mutation.isPending}>
            保存项目
          </Button>
        </div>
      ) : null}
    </form>
  )
}
