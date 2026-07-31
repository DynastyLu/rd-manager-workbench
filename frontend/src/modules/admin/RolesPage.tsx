import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Form,
  Modal,
  Switch,
  Table,
  Tag,
  Toast,
} from '@douyinfe/semi-ui'
import { IconCopy, IconDelete, IconEdit } from '@douyinfe/semi-icons'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { ApiError } from '@/lib/http'
import { tableScrollWidth } from '@/lib/tableScrollWidth'
import { copyRole, createRole, deleteRole, listPermissions, listRoles, updateRole } from './api'
import RolePermissionMatrix from './RolePermissionMatrix'
import type { CopyRoleInput, CreateRoleInput, Role } from './types'
import './AdminPages.less'

interface RoleEditorState {
  mode: 'create' | 'edit' | 'copy'
  role?: Role
}

interface RoleFormValues {
  code?: string
  name?: string
  description?: string
  isEnabled?: boolean
  permissions?: Array<{
    permissionCode: string
    dataScope: string
    scopeConfig?: Record<string, unknown> | null
  }>
}

export default function RolesPage() {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<RoleEditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [form] = Form.useForm()

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  })

  const permissionsQuery = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: listPermissions,
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateRoleInput) => createRole(input),
    onSuccess: () => {
      Toast.success('角色创建成功')
      setEditor(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '创建失败'
      Toast.error(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: Partial<RoleFormValues> }) => updateRole(roleId, input),
    onSuccess: () => {
      Toast.success('角色更新成功')
      setEditor(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '更新失败'
      Toast.error(message)
    },
  })

  const copyMutation = useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: CopyRoleInput }) => copyRole(roleId, input),
    onSuccess: () => {
      Toast.success('角色复制成功')
      setEditor(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '复制失败'
      Toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      Toast.success('角色已删除')
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '删除失败'
      Toast.error(message)
    },
  })

  const columns = useMemo<ColumnProps<Role>[]>(
    () => [
      {
        title: '角色编码',
        dataIndex: 'code',
        width: 140,
      },
      {
        title: '角色名称',
        dataIndex: 'name',
        width: 140,
      },
      {
        title: '类型',
        dataIndex: 'isSystem',
        width: 100,
        render: (value: boolean) =>
          value ? (
            <Tag color="blue" type="light">系统内置</Tag>
          ) : (
            <Tag type="light">自定义</Tag>
          ),
      },
      {
        title: '状态',
        dataIndex: 'isEnabled',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'grey'} type="light">
            {value ? '已启用' : '已停用'}
          </Tag>
        ),
      },
      {
        title: '用户数',
        dataIndex: 'userCount',
        width: 90,
      },
      {
        title: '说明',
        dataIndex: 'description',
        width: 240,
        render: (value: string | null) => value || '—',
      },
      {
        title: '操作',
        fixed: 'right',
        width: 300,
        render: (_, record) => {
          const isSystem = record.isSystem
          return (
            <div className="admin-roles__actions">
              {isSystem ? (
                <span className="admin-roles__system-hint">
                  系统内置角色，不可编辑、停用或删除
                </span>
              ) : null}
              <Button
                theme="borderless"
                size="small"
                icon={<IconEdit />}
                disabled={isSystem}
                aria-label={`编辑角色：${record.name}`}
                onClick={() => {
                  form.setValues({
                    code: record.code,
                    name: record.name,
                    description: record.description ?? '',
                    isEnabled: record.isEnabled,
                  })
                  setEditor({ mode: 'edit', role: record })
                }}
              >
                编辑
              </Button>
              <Button
                theme="borderless"
                size="small"
                icon={<IconCopy />}
                aria-label={`复制角色：${record.name}`}
                onClick={() => {
                  form.reset()
                  setEditor({ mode: 'copy', role: record })
                }}
              >
                复制
              </Button>
              <Button
                theme="borderless"
                size="small"
                type="danger"
                icon={<IconDelete />}
                disabled={isSystem}
                aria-label={`删除角色：${record.name}`}
                onClick={() => setDeleteTarget(record)}
              >
                删除
              </Button>
            </div>
          )
        },
      },
    ],
    [form]
  )

  function asString(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  function handleSubmit(values: Record<string, unknown>) {
    const base = {
      name: asString(values.name),
      description: optionalString(values.description),
      isEnabled: Boolean(values.isEnabled),
    }

    if (editor?.mode === 'create') {
      createMutation.mutate({
        code: asString(values.code),
        ...base,
      })
    } else if (editor?.mode === 'edit' && editor.role) {
      updateMutation.mutate({
        roleId: editor.role.id,
        input: base,
      })
    } else if (editor?.mode === 'copy' && editor.role) {
      copyMutation.mutate({
        roleId: editor.role.id,
        input: {
          code: asString(values.code),
          name: asString(values.name),
          description: base.description,
        },
      })
    }
  }

  const allPermissions = permissionsQuery.data ?? []

  return (
    <section className="admin-page admin-roles">
      <div className="admin-page__toolbar">
        <div className="admin-page__toolbar-spacer" />
        <Button
          theme="solid"
          type="primary"
          onClick={() => {
            form.reset()
            setEditor({ mode: 'create' })
          }}
        >
          新建角色
        </Button>
      </div>

      <Table
        className="admin-roles__table"
        columns={columns}
        dataSource={rolesQuery.data ?? []}
        loading={rolesQuery.isLoading}
        pagination={false}
        scroll={{ x: tableScrollWidth(columns) }}
        rowKey="id"
      />

      <Modal
        title={
          editor?.mode === 'create'
            ? '新建角色'
            : editor?.mode === 'edit'
              ? `编辑角色：${editor.role?.name ?? ''}`
              : '复制角色'
        }
        visible={editor !== null}
        onCancel={() => setEditor(null)}
        footer={null}
        width={720}
        closeOnEsc
      >
        <Form
          form={form}
          layout="vertical"
          onSubmit={handleSubmit}
          className="workspace-modal-form"
        >
          <Form.Input
            field="code"
            label="角色编码"
            placeholder="例如 DEPARTMENT_LEAD"
            rules={[{ required: true, message: '请输入角色编码' }]}
            disabled={editor?.mode === 'edit'}
          />
          <Form.Input
            field="name"
            label="角色名称"
            placeholder="例如 部门主管"
            rules={[{ required: true, message: '请输入角色名称' }]}
          />
          <Form.TextArea
            field="description"
            label="角色说明"
            placeholder="描述该角色的使用场景"
            rows={2}
          />

          {editor?.mode === 'edit' ? (
            <Form.Slot>
              <span className="workspace-modal-form__field-label">是否启用</span>
              <Switch
                checked={!!form.getValue('isEnabled')}
                onChange={(checked) => form.setValue('isEnabled', checked)}
                aria-label="是否启用"
              />
              <span className="workspace-modal-form__field-hint">启用该角色</span>
            </Form.Slot>
          ) : null}

          <div className="admin-roles__matrix-section">
            <h4>权限配置</h4>
            <RolePermissionMatrix
              permissions={allPermissions}
              value={editor?.role?.permissions ?? []}
              onChange={(permissions) => form.setValue('permissions', permissions)}
            />
          </div>

          <div className="workspace-modal-form__actions">
            <Button onClick={() => setEditor(null)} type="tertiary">取消</Button>
            <Button
              theme="solid"
              type="primary"
              htmlType="submit"
              loading={
                createMutation.isPending || updateMutation.isPending || copyMutation.isPending
              }
            >
              {editor?.mode === 'create'
                ? '创建角色'
                : editor?.mode === 'edit'
                  ? '保存修改'
                  : '创建副本'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={`删除角色：${deleteTarget?.name ?? ''}`}
        visible={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        footer={(
          <div className="workspace-modal-footer">
            <Button onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button
              theme="solid"
              type="danger"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              确认删除
            </Button>
          </div>
        )}
        closeOnEsc
      >
        <p>删除角色后，已分配该角色的用户将失去对应权限。是否继续？</p>
      </Modal>
    </section>
  )
}
