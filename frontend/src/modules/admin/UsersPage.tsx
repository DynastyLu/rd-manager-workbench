import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banner,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  Toast,
} from '@douyinfe/semi-ui'
import { IconPlus, IconSearch } from '@douyinfe/semi-icons'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { ApiError } from '@/lib/http'
import { tableScrollWidth } from '@/lib/tableScrollWidth'
import {
  createUser,
  deleteUser,
  disableUser,
  enableUser,
  listAssignableEmployees,
  listRoles,
  listUsers,
  resetUserPassword,
  revokeUserSessions,
  updateUser,
} from './api'
import UserEditor, { type UserFormValues } from './UserEditor'
import { STATUS_COLORS, STATUS_LABELS } from './user-status'
import type { AdminUser } from './types'
import './AdminPages.less'

const PAGE_SIZE = 20

interface ConfirmState {
  kind: 'reset-password' | 'disable' | 'enable' | 'revoke-sessions' | 'delete'
  user: AdminUser
}

function userDisplayName(user: AdminUser): string {
  return user.resourceProfile?.displayName ?? user.username
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; user: AdminUser } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [resetPassword, setResetPassword] = useState('')

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { page, pageSize: PAGE_SIZE, search, status: statusFilter }],
    queryFn: () =>
      listUsers({
        page,
        pageSize: PAGE_SIZE,
        search,
        status: statusFilter as AdminUser['status'],
      }),
  })

  const employeesQuery = useQuery({
    queryKey: ['admin', 'assignable-employees'],
    queryFn: listAssignableEmployees,
    staleTime: 60_000,
  })

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      Toast.success('账号创建成功')
      setEditor(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '创建失败'
      Toast.error(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UserFormValues }) =>
      updateUser(userId, input),
    onSuccess: () => {
      Toast.success('账号更新成功')
      setEditor(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '更新失败'
      Toast.error(message)
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      resetUserPassword(userId, password),
    onSuccess: () => {
      Toast.success('密码已重置')
      setConfirm(null)
      setResetPassword('')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '重置失败'
      Toast.error(message)
    },
  })

  const disableMutation = useMutation({
    mutationFn: disableUser,
    onSuccess: () => {
      Toast.success('账号已停用')
      setConfirm(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '停用失败'
      Toast.error(message)
    },
  })

  const enableMutation = useMutation({
    mutationFn: enableUser,
    onSuccess: () => {
      Toast.success('账号已启用')
      setConfirm(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '启用失败'
      Toast.error(message)
    },
  })

  const revokeSessionsMutation = useMutation({
    mutationFn: revokeUserSessions,
    onSuccess: () => {
      Toast.success('已强制退出全部设备')
      setConfirm(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '操作失败'
      Toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ userId, confirmNoOwnershipReferences }: { userId: string; confirmNoOwnershipReferences: boolean }) =>
      deleteUser(userId, { confirmNoOwnershipReferences }),
    onSuccess: () => {
      Toast.success('账号已删除')
      setConfirm(null)
      setDeleteConfirmed(false)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '删除失败'
      Toast.error(message)
    },
  })

  const columns = useMemo<ColumnProps<AdminUser>[]>(
    () => [
      {
        title: '用户',
        dataIndex: 'username',
        width: 180,
        render: (_value, record) => (
          <div className="admin-users__identity">
            <strong>{record.username}</strong>
            <span className="admin-users__name">{userDisplayName(record)}</span>
          </div>
        ),
      },
      {
        title: '工号',
        dataIndex: 'employeeNo',
        width: 100,
        render: (value: string | null) => value || '—',
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 90,
        render: (value: AdminUser['status']) => (
          <Tag color={STATUS_COLORS[value]} type="light">
            {STATUS_LABELS[value]}
          </Tag>
        ),
      },
      {
        title: '角色',
        dataIndex: 'roles',
        width: 160,
        render: (_, record) => (
          <div className="admin-users__roles">
            {record.roles.map((role) => (
              <Tag key={role.id} type="light">{role.name}</Tag>
            ))}
          </div>
        ),
      },
      {
        title: '部门',
        dataIndex: 'resourceProfile.department',
        width: 140,
        render: (_, record) => record.resourceProfile?.department || '—',
      },
      {
        title: '最近登录',
        dataIndex: 'lastLoginAt',
        width: 160,
        render: (value: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '从未登录'),
      },
      {
        title: '操作',
        fixed: 'right',
        width: 300,
        render: (_, record) => {
          const displayName = userDisplayName(record)
          const canDelete = record.status === 'DISABLED'
          return (
            <div className="admin-users__actions">
              <Button
                theme="borderless"
                size="small"
                aria-label={`编辑账号：${displayName}`}
                onClick={() => setEditor({ mode: 'edit', user: record })}
              >
                编辑
              </Button>
              <Button
                theme="borderless"
                size="small"
                aria-label={`重置密码：${displayName}`}
                onClick={() => {
                  setConfirm({ kind: 'reset-password', user: record })
                }}
              >
                重置密码
              </Button>
              {record.status === 'DISABLED' ? (
                <Button
                  theme="borderless"
                  size="small"
                  aria-label={`启用账号：${displayName}`}
                  onClick={() => setConfirm({ kind: 'enable', user: record })}
                >
                  启用
                </Button>
              ) : (
                <Button
                  theme="borderless"
                  size="small"
                  type="danger"
                  aria-label={`停用账号：${displayName}`}
                  onClick={() => setConfirm({ kind: 'disable', user: record })}
                >
                  停用
                </Button>
              )}
              <Button
                theme="borderless"
                size="small"
                aria-label={`强制退出：${displayName}`}
                onClick={() => setConfirm({ kind: 'revoke-sessions', user: record })}
              >
                强制退出
              </Button>
              <Button
                theme="borderless"
                size="small"
                type="danger"
                disabled={!canDelete}
                aria-label={`永久删除账号：${displayName}`}
                onClick={() => setConfirm({ kind: 'delete', user: record })}
              >
                永久删除
              </Button>
            </div>
          )
        },
      },
    ],
    []
  )

  function handleEditorSubmit(values: UserFormValues) {
    if (editor?.mode === 'create') {
      createMutation.mutate({
        resourceProfileId: values.resourceProfileId!,
        username: values.username,
        employeeNo: values.employeeNo,
        roleIds: values.roleIds,
        temporaryPassword: values.temporaryPassword!,
      })
    } else if (editor?.mode === 'edit') {
      updateMutation.mutate({
        userId: editor.user.id,
        input: {
          username: values.username,
          employeeNo: values.employeeNo,
          roleIds: values.roleIds,
        },
      })
    }
  }

  function handleConfirmAction() {
    if (!confirm) return
    const { kind, user } = confirm
    if (kind === 'reset-password') {
      resetPasswordMutation.mutate({ userId: user.id, password: resetPassword })
    } else if (kind === 'disable') {
      disableMutation.mutate(user.id)
    } else if (kind === 'enable') {
      enableMutation.mutate(user.id)
    } else if (kind === 'revoke-sessions') {
      revokeSessionsMutation.mutate(user.id)
    } else if (kind === 'delete') {
      deleteMutation.mutate({ userId: user.id, confirmNoOwnershipReferences: deleteConfirmed })
    }
  }

  const users = usersQuery.data?.data ?? []
  const meta = usersQuery.data?.meta

  const confirmTitle = useMemo(() => {
    if (!confirm) return ''
    const name = userDisplayName(confirm.user)
    switch (confirm.kind) {
      case 'reset-password':
        return `重置${name}的密码`
      case 'disable':
        return `停用${name}的账号`
      case 'enable':
        return `启用${name}的账号`
      case 'revoke-sessions':
        return `强制退出${name}的全部设备`
      case 'delete':
        return `永久删除${name}的账号`
      default:
        return ''
    }
  }, [confirm])

  return (
    <section className="admin-page admin-users">
      <div className="admin-page__toolbar">
        <Input
          prefix={<IconSearch />}
          placeholder="搜索账号、姓名或工号"
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          aria-label="搜索用户"
        />
        <Select
          placeholder="全部状态"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as string)
            setPage(1)
          }}
          optionList={[
            { value: 'ACTIVE', label: '正常' },
            { value: 'DISABLED', label: '已停用' },
            { value: 'LOCKED', label: '已锁定' },
            { value: 'PENDING', label: '待激活' },
          ]}
          showClear
          aria-label="状态筛选"
        />
        <div className="admin-page__toolbar-spacer" />
        <Button
          theme="solid"
          type="primary"
          icon={<IconPlus />}
          onClick={() => setEditor({ mode: 'create' })}
          aria-label="创建账号"
        >
          创建账号
        </Button>
      </div>

      {users.some((user) => user.status === 'ACTIVE') ? null : (
        <Banner
          type="info"
          description="列表为空时，可通过上方搜索条件查找或创建新账号。"
          className="admin-page__banner"
        />
      )}

      <Table
        className="admin-users__table"
        columns={columns}
        dataSource={users}
        loading={usersQuery.isLoading}
        pagination={
          meta
            ? {
                currentPage: meta.page,
                pageSize: meta.pageSize,
                total: meta.total,
                onPageChange: setPage,
              }
            : false
        }
        scroll={{ x: tableScrollWidth(columns) }}
        rowKey="id"
      />

      {usersQuery.data?.data.length === 0 && !usersQuery.isLoading ? (
        <p className="admin-page__empty-hint">未找到匹配的用户账号</p>
      ) : null}

      <p className="admin-users__delete-hint">
        永久删除前必须先停用账号并强制退出全部设备
      </p>

      <UserEditor
        mode={editor?.mode ?? 'create'}
        user={editor?.mode === 'edit' ? editor.user : undefined}
        employees={employeesQuery.data ?? []}
        roles={rolesQuery.data ?? []}
        open={editor !== null}
        loading={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
        onSubmit={handleEditorSubmit}
      />

      <Modal
        title={confirmTitle}
        visible={confirm !== null}
        onCancel={() => {
          setConfirm(null)
          setResetPassword('')
          setDeleteConfirmed(false)
        }}
        footer={(
          <div className="workspace-modal-footer">
            <Button
              onClick={() => {
                setConfirm(null)
                setResetPassword('')
                setDeleteConfirmed(false)
              }}
            >
              取消
            </Button>
            <Button
              theme="solid"
              type={confirm?.kind === 'delete' ? 'danger' : 'primary'}
              loading={
                resetPasswordMutation.isPending ||
                disableMutation.isPending ||
                enableMutation.isPending ||
                revokeSessionsMutation.isPending ||
                deleteMutation.isPending
              }
              disabled={confirm?.kind === 'delete' ? !deleteConfirmed : false}
              onClick={handleConfirmAction}
            >
              {confirm?.kind === 'reset-password'
                ? '确认重置密码'
                : confirm?.kind === 'disable'
                  ? '确认停用账号'
                  : confirm?.kind === 'enable'
                    ? '确认启用账号'
                    : confirm?.kind === 'revoke-sessions'
                      ? '确认强制退出'
                      : '永久删除账号'}
            </Button>
          </div>
        )}
        closeOnEsc
        aria-label={confirmTitle}
      >
        {confirm?.kind === 'reset-password' ? (
          <div className="workspace-modal-form">
            <label className="workspace-modal-form__field" htmlFor="reset-password-input">
              <span>新的临时密码</span>
              <Input
                id="reset-password-input"
                type="password"
                value={resetPassword}
                onChange={setResetPassword}
                aria-label="新的临时密码"
              />
            </label>
            <p className="admin-form__hint">将撤销该用户的全部登录会话</p>
          </div>
        ) : null}

        {confirm?.kind === 'disable' ? (
          <p className="admin-form__hint">停用后立即撤销全部登录会话</p>
        ) : null}

        {confirm?.kind === 'revoke-sessions' ? (
          <p className="admin-form__hint">用户需要重新登录</p>
        ) : null}

        {confirm?.kind === 'delete' ? (
          <div className="workspace-modal-form">
            <Banner type="danger" description="此操作不可撤销" />
            <Checkbox
              checked={deleteConfirmed}
              onChange={(event) => setDeleteConfirmed(!!event.target.checked)}
              aria-label="已确认账号已停用、会话已撤销且业务数据归属已完成转移"
            >
              已确认账号已停用、会话已撤销且业务数据归属已完成转移
            </Checkbox>
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
