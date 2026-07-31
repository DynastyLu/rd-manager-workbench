import { useEffect, useMemo, useRef } from 'react'
import { Button, Form, Modal, Toast } from '@douyinfe/semi-ui'
import type { AdminUser, AssignableEmployee, Role } from './types'

interface UserEditorProps {
  mode: 'create' | 'edit'
  user?: AdminUser
  employees: AssignableEmployee[]
  roles: Role[]
  open: boolean
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserFormValues) => void
}

export interface UserFormValues {
  resourceProfileId?: string
  username: string
  employeeNo?: string
  temporaryPassword?: string
  roleIds: string[]
}

function employeeOptionLabel(employee: AssignableEmployee): string {
  const parts = [employee.displayName]
  if (employee.employeeNo) parts.push(`(${employee.employeeNo})`)
  if (employee.department) parts.push(employee.department)
  if (employee.roleTitle) parts.push(employee.roleTitle)
  return parts.join(' · ')
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export default function UserEditor({
  mode,
  user,
  employees,
  roles,
  open,
  loading,
  onOpenChange,
  onSubmit,
}: UserEditorProps) {
  const [form] = Form.useForm()
  const dialogBodyRef = useRef<HTMLDivElement>(null)

  const title = mode === 'create' ? '创建用户账号' : '编辑用户账号'
  const submitLabel = mode === 'create' ? '创建账号' : '保存修改'

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employeeOptionLabel(employee),
      })),
    [employees]
  )

  const roleOptions = useMemo(
    () =>
      roles.map((role) => ({
        value: role.id,
        label: `${role.name} (${role.code})`,
      })),
    [roles]
  )

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && user) {
        form.setValues({
          username: user.username,
          employeeNo: user.employeeNo ?? '',
          roleIds: user.roles.map((role) => role.id),
        })
      } else {
        form.reset()
      }
    }
  }, [open, mode, user, form])

  function handleEmployeeChange(value: unknown) {
    const employeeId = typeof value === 'string' ? value : undefined
    if (employeeId) {
      form.setValue('resourceProfileId', employeeId)
      const employee = employees.find((item) => item.id === employeeId)
      if (employee?.employeeNo) {
        form.setValue('employeeNo', employee.employeeNo)
      }
    }
  }

  function handleSubmit(values: Record<string, unknown>) {
    const roleIds = Array.isArray(values.roleIds)
      ? values.roleIds.filter((id): id is string => typeof id === 'string')
      : []
    const payload: UserFormValues = {
      username: asString(values.username),
      employeeNo: optionalString(values.employeeNo),
      roleIds,
    }
    if (mode === 'create') {
      const profileId = asString(values.resourceProfileId)
      if (!profileId) {
        Toast.error('请选择绑定员工')
        return
      }
      payload.resourceProfileId = profileId
      payload.temporaryPassword = optionalString(values.temporaryPassword)
    }
    onSubmit(payload)
  }

  return (
    <Modal
      title={title}
      visible={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      width={520}
      closeOnEsc
      aria-label={title}
    >
      <div ref={dialogBodyRef}>
        <Form
          form={form}
          layout="vertical"
          onSubmit={handleSubmit}
          className="workspace-modal-form"
        >
          {mode === 'create' ? (
            <>
              <Form.Select
                field="resourceProfileId"
                label="绑定员工"
                placeholder="请选择要绑定账号的员工"
                optionList={employeeOptions}
                rules={[{ required: true, message: '请选择绑定员工' }]}
                onChange={handleEmployeeChange}
                getPopupContainer={() => {
                  const body = document.querySelector('.semi-modal-body')
                  return body instanceof HTMLElement ? body : document.body
                }}
                aria-label="绑定员工"
              />

              <Form.Input
                field="username"
                label="登录账号"
                placeholder="例如 lin.xiao"
                rules={[{ required: true, message: '请输入登录账号' }]}
                aria-label="登录账号"
              />

              <Form.Input
                field="employeeNo"
                label="工号"
                placeholder="可覆盖自动填充的工号"
                aria-label="工号"
              />

              <Form.Input
                field="temporaryPassword"
                label="临时密码"
                type="password"
                placeholder="首次登录将强制修改临时密码"
                rules={[{ required: true, message: '请输入临时密码' }]}
                aria-label="临时密码"
              />
              <p className="admin-form__hint">首次登录将强制修改临时密码</p>
            </>
          ) : (
            <>
              <Form.Input
                field="username"
                label="登录账号"
                placeholder="例如 lin.xiao"
                rules={[{ required: true, message: '请输入登录账号' }]}
                aria-label="登录账号"
              />

              <Form.Input
                field="employeeNo"
                label="工号"
                placeholder="留空表示无工号"
                aria-label="工号"
              />
            </>
          )}

          <Form.Select
            field="roleIds"
            label="分配角色"
            placeholder="请选择角色"
            optionList={roleOptions}
            rules={[{ required: true, message: '请至少分配一个角色' }]}
            multiple
            aria-label="分配角色"
          />

          <div className="workspace-modal-form__actions">
            <Button onClick={() => onOpenChange(false)} type="tertiary">取消</Button>
            <Button theme="solid" type="primary" htmlType="submit" loading={loading}>
              {submitLabel}
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  )
}
