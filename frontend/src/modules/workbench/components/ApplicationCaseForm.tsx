import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CreateApplicationCaseInput, WorkflowTemplate } from '@/modules/workbench/api/applications'

interface ApplicationCaseFormProps {
  templates: WorkflowTemplate[]
  onSubmit: (input: CreateApplicationCaseInput) => void | Promise<unknown>
  isSubmitting?: boolean
}

export function ApplicationCaseForm({
  templates,
  onSubmit,
  isSubmitting = false,
}: ApplicationCaseFormProps) {
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workflowTemplateId, setWorkflowTemplateId] = useState('')
  const [errors, setErrors] = useState<{ code?: string; title?: string; project?: string; template?: string }>({})

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      code: code.trim() ? undefined : '请填写案件编号',
      title: title.trim() ? undefined : '请填写案件名称',
      project: projectId.trim() ? undefined : '请选择关联项目',
      template: workflowTemplateId ? undefined : '请选择流程模板',
    }
    setErrors(nextErrors)

    if (nextErrors.code || nextErrors.title || nextErrors.project || nextErrors.template) {
      return
    }

    void onSubmit({
      code: code.trim(),
      title: title.trim(),
      projectId: projectId.trim(),
      workflowTemplateId,
    })
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="application-case-name">案件名称</Label>
        <Input
          id="application-case-name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={isSubmitting}
          autoComplete="off"
        />
        {errors.title ? <p className="text-sm text-destructive" role="alert">{errors.title}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="application-case-code">案件编号</Label>
        <Input
          id="application-case-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={isSubmitting}
          autoComplete="off"
        />
        {errors.code ? <p className="text-sm text-destructive" role="alert">{errors.code}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="application-case-project">关联项目 ID</Label>
        <Input
          id="application-case-project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          disabled={isSubmitting}
          autoComplete="off"
        />
        {errors.project ? <p className="text-sm text-destructive" role="alert">{errors.project}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="application-case-template">流程模板</Label>
        <select
          id="application-case-template"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          value={workflowTemplateId}
          onChange={(event) => setWorkflowTemplateId(event.target.value)}
          disabled={isSubmitting}
        >
          <option value="">请选择流程模板</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        {errors.template ? <p className="text-sm text-destructive" role="alert">{errors.template}</p> : null}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        创建案件
      </Button>
    </form>
  )
}
