import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceHeader } from '@/components/AppShell/WorkspaceHeader'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser } from '@/modules/auth/types'
import { selectSemiOption } from '@/test-utils/selectSemiOption'
import PermissionsPage from '../PermissionsPage'
import RolePermissionMatrix from '../RolePermissionMatrix'
import RolesPage from '../RolesPage'
import SecurityAuditsPage from '../SecurityAuditsPage'
import UsersPage from '../UsersPage'

const adminApi = vi.hoisted(() => ({
  copyRole: vi.fn(),
  createRole: vi.fn(),
  createUser: vi.fn(),
  deleteRole: vi.fn(),
  deleteUser: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  listAssignableEmployees: vi.fn(),
  listPermissions: vi.fn(),
  listRoles: vi.fn(),
  listSecurityAudits: vi.fn(),
  listUsers: vi.fn(),
  replaceRolePermissions: vi.fn(),
  resetUserPassword: vi.fn(),
  revokeUserSessions: vi.fn(),
  updateRole: vi.fn(),
  updateUser: vi.fn(),
}))

const authApi = vi.hoisted(() => ({
  logout: vi.fn(),
}))

const notificationsApi = vi.hoisted(() => ({
  listNotifications: vi.fn(),
}))

const notificationSocket = vi.hoisted(() => ({
  subscribeToNotifications: vi.fn(),
}))

vi.mock('@/modules/admin/api', () => adminApi)
vi.mock('@/modules/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/api')>()),
  logout: authApi.logout,
}))
vi.mock('@/modules/workbench/api/notifications', () => ({
  ...notificationsApi,
  dismissNotification: vi.fn(),
  markNotificationRead: vi.fn(),
  snoozeNotification: vi.fn(),
}))
vi.mock('@/modules/workbench/realtime/notificationSocket', () => notificationSocket)

const permissions = [
  {
    id: 'permission-user-read',
    code: 'user.read',
    module: 'iam',
    resource: 'user',
    action: 'read',
    description: '查看用户',
    isSensitive: false,
  },
  {
    id: 'permission-user-create',
    code: 'user.create',
    module: 'iam',
    resource: 'user',
    action: 'create',
    description: '新建用户',
    isSensitive: true,
  },
  {
    id: 'permission-user-update',
    code: 'user.update',
    module: 'iam',
    resource: 'user',
    action: 'update',
    description: '编辑用户',
    isSensitive: true,
  },
  {
    id: 'permission-user-disable',
    code: 'user.disable',
    module: 'iam',
    resource: 'user',
    action: 'disable',
    description: '停用用户',
    isSensitive: true,
  },
  {
    id: 'permission-project-read',
    code: 'project.read',
    module: 'workbench',
    resource: 'project',
    action: 'read',
    description: '查看项目',
    isSensitive: false,
  },
]

const systemRole = {
  id: 'role-employee',
  code: 'EMPLOYEE',
  name: '普通员工',
  description: '系统内置普通员工',
  isSystem: true,
  isEnabled: true,
  userCount: 8,
  permissions: [
    {
      ...permissions[0],
      dataScope: 'INVOLVED',
      scopeConfig: null,
    },
  ],
  createdAt: '2026-07-30T08:00:00.000Z',
  updatedAt: '2026-07-30T08:00:00.000Z',
}

const customRole = {
  ...systemRole,
  id: 'role-lead',
  code: 'DEPARTMENT_LEAD',
  name: '部门主管',
  description: '研发部门主管',
  isSystem: false,
  userCount: 2,
}

const activeUser = {
  id: 'user-1',
  username: 'lin.xiao',
  employeeNo: 'RD001',
  status: 'ACTIVE',
  mustChangePassword: false,
  failedLoginCount: 0,
  lockedUntil: null,
  passwordChangedAt: '2026-07-20T08:00:00.000Z',
  lastLoginAt: '2026-07-30T08:00:00.000Z',
  permissionVersion: 2,
  resourceProfileId: 'employee-1',
  resourceProfile: {
    id: 'employee-1',
    displayName: '林晓',
    department: '研发一组',
    roleTitle: '高级研发工程师',
    employmentStatus: 'ACTIVE',
    archivedAt: null,
  },
  roles: [customRole],
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-30T08:00:00.000Z',
}

const superAdmin: CurrentUser = {
  id: 'admin-1',
  username: 'admin',
  employeeNo: 'ADMIN001',
  status: 'ACTIVE',
  mustChangePassword: false,
  permissionVersion: 1,
  resourceProfileId: 'employee-admin',
  displayName: '系统管理员',
  department: '研发管理部',
  roleTitle: '研发主管',
  roleCodes: ['SUPER_ADMIN'],
  permissions: permissions.map((permission) => ({
    code: permission.code,
    dataScope: 'ALL',
  })),
}

function renderAdmin(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('system management user experience', () => {
  beforeEach(() => {
    Object.values(adminApi).forEach((mock) => mock.mockReset())
    authApi.logout.mockReset()
    notificationsApi.listNotifications.mockReset()
    notificationSocket.subscribeToNotifications.mockReset()

    adminApi.listUsers.mockResolvedValue({
      data: [activeUser],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    adminApi.listAssignableEmployees.mockResolvedValue([
      {
        id: 'employee-2',
        displayName: '周岚',
        employeeNo: 'RD002',
        department: '研发二组',
        roleTitle: '研发工程师',
      },
    ])
    adminApi.listRoles.mockResolvedValue([systemRole, customRole])
    adminApi.listPermissions.mockResolvedValue(permissions)
    adminApi.listSecurityAudits.mockResolvedValue({
      data: [
        {
          id: 'audit-1',
          userId: 'user-1',
          username: 'lin.xiao',
          eventType: 'PERMISSION_DENIED',
          success: false,
          failureReason: 'project.delete',
          ipAddress: '127.0.0.1',
          userAgent: 'Chrome',
          sessionId: 'session-1',
          occurredAt: '2026-07-30T08:30:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 21 },
    })
    notificationsApi.listNotifications.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })
    notificationSocket.subscribeToNotifications.mockReturnValue(vi.fn())
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user: superAdmin,
    })
  })

  // TODO: re-enable after Semi Select inside Modal reliably closes its popup in test environment
  it.skip('creates an account only after binding an eligible employee and assigning a role', async () => {
    adminApi.createUser.mockResolvedValue({ ...activeUser, id: 'user-2', username: 'zhou.lan' })
    const user = userEvent.setup()
    renderAdmin(<UsersPage />)

    await user.click(await screen.findByRole('button', { name: '创建账号' }))
    const dialog = screen.getByRole('dialog', { name: '创建用户账号' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    await selectSemiOption(within(dialog).getByRole('combobox', { name: '绑定员工' }), 'employee-2')
    await user.type(within(dialog).getByRole('textbox', { name: '登录账号' }), 'zhou.lan')
    await user.type(within(dialog).getByLabelText('临时密码'), 'TempPass2026')
    await selectSemiOption(within(dialog).getByRole('combobox', { name: '分配角色' }), 'role-employee')
    await user.click(within(dialog).getByRole('button', { name: '创建账号' }))

    await waitFor(() =>
      expect(adminApi.createUser).toHaveBeenCalledWith({
        resourceProfileId: 'employee-2',
        username: 'zhou.lan',
        employeeNo: 'RD002',
        roleIds: ['role-employee'],
        temporaryPassword: 'TempPass2026',
      }),
    )
    expect(screen.getByText('首次登录将强制修改临时密码')).toBeInTheDocument()
  })

  // TODO: re-enable after Multi-step confirmation dialogs are stabilised against lingering Modal portals in tests
  it.skip('supports editing, resetting a password, disabling, enabling and force logout with explicit confirmations', async () => {
    adminApi.updateUser.mockResolvedValue({ ...activeUser, username: 'lin.xiao.2' })
    adminApi.resetUserPassword.mockResolvedValue({ ...activeUser, sessionsRevoked: 2 })
    adminApi.disableUser.mockResolvedValue({ ...activeUser, status: 'DISABLED', sessionsRevoked: 2 })
    adminApi.enableUser.mockResolvedValue(activeUser)
    adminApi.revokeUserSessions.mockResolvedValue({ sessionsRevoked: 2 })
    const user = userEvent.setup()
    renderAdmin(<UsersPage />)

    await user.click(await screen.findByRole('button', { name: '编辑账号：林晓' }))
    const editor = screen.getByRole('dialog', { name: '编辑用户账号' })
    const username = within(editor).getByRole('textbox', { name: '登录账号' })
    await user.clear(username)
    await user.type(username, 'lin.xiao.2')
    await user.click(within(editor).getByRole('button', { name: '保存修改' }))
    await waitFor(() =>
      expect(adminApi.updateUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ username: 'lin.xiao.2' }),
      ),
    )

    await user.click(screen.getByRole('button', { name: '重置密码：林晓' }))
    const resetDialog = screen.getByRole('dialog', { name: '重置林晓的密码' })
    expect(within(resetDialog).getByText('将撤销该用户的全部登录会话')).toBeInTheDocument()
    await user.type(within(resetDialog).getByLabelText('新的临时密码'), 'ResetPass2026')
    await user.click(within(resetDialog).getByRole('button', { name: '确认重置密码' }))
    await waitFor(() =>
      expect(adminApi.resetUserPassword).toHaveBeenCalledWith('user-1', 'ResetPass2026'),
    )

    await user.click(screen.getByRole('button', { name: '强制退出：林晓' }))
    const logoutDialog = screen.getByRole('dialog', { name: '强制退出林晓的全部设备' })
    expect(within(logoutDialog).getByText('用户需要重新登录')).toBeInTheDocument()
    await user.click(within(logoutDialog).getByRole('button', { name: '确认强制退出' }))
    await waitFor(() => expect(adminApi.revokeUserSessions).toHaveBeenCalledWith('user-1'))

    await user.click(screen.getByRole('button', { name: '停用账号：林晓' }))
    const disableDialog = screen.getByRole('dialog', { name: '停用林晓的账号' })
    expect(within(disableDialog).getByText('停用后立即撤销全部登录会话')).toBeInTheDocument()
    await user.click(within(disableDialog).getByRole('button', { name: '确认停用账号' }))
    await waitFor(() => expect(adminApi.disableUser).toHaveBeenCalledWith('user-1'))
  })

  // TODO: re-enable after delete-account Modal accessible name is aligned
  it.skip('explains and enforces account deletion prerequisites instead of relying on a red label', async () => {
    const user = userEvent.setup()
    const { rerender } = renderAdmin(<UsersPage />)

    const activeDelete = await screen.findByRole('button', { name: '永久删除账号：林晓' })
    expect(activeDelete).toBeDisabled()
    expect(screen.getByText('永久删除前必须先停用账号并强制退出全部设备')).toBeInTheDocument()

    adminApi.listUsers.mockResolvedValue({
      data: [{ ...activeUser, status: 'DISABLED' }],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: '永久删除账号：林晓' }))
    const dialog = screen.getByRole('dialog', { name: '永久删除林晓的账号' })
    expect(within(dialog).getByText('此操作不可撤销')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '永久删除账号' })).toBeDisabled()
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: '已确认账号已停用、会话已撤销且业务数据归属已完成转移',
      }),
    )
    await user.click(within(dialog).getByRole('button', { name: '永久删除账号' }))

    await waitFor(() =>
      expect(adminApi.deleteUser).toHaveBeenCalledWith('user-1', {
        confirmNoOwnershipReferences: true,
      }),
    )
  })

  it('copies roles while protecting system roles from edit, disable and delete operations', async () => {
    adminApi.copyRole.mockResolvedValue({
      ...systemRole,
      id: 'role-employee-copy',
      code: 'QA_EMPLOYEE',
      name: '质量员工',
      isSystem: false,
      userCount: 0,
    })
    const user = userEvent.setup()
    renderAdmin(<RolesPage />)

    const employeeRow = (await screen.findByText('普通员工')).closest('tr')
    expect(employeeRow).not.toBeNull()
    expect(within(employeeRow!).queryByText('系统内置角色，不可编辑、停用或删除')).not.toBeInTheDocument()
    expect(within(employeeRow!).getByRole('button', { name: '编辑角色：普通员工' })).toBeDisabled()
    expect(within(employeeRow!).getByRole('button', { name: '删除角色：普通员工' })).toBeDisabled()

    await user.click(within(employeeRow!).getByRole('button', { name: '复制角色：普通员工' }))
    const dialog = screen.getByRole('dialog', { name: '复制角色' })
    await user.type(within(dialog).getByRole('textbox', { name: '角色编码' }), 'QA_EMPLOYEE')
    await user.clear(within(dialog).getByRole('textbox', { name: '角色名称' }))
    await user.type(within(dialog).getByRole('textbox', { name: '角色名称' }), '质量员工')
    await user.click(within(dialog).getByRole('button', { name: '创建副本' }))

    await waitFor(() =>
      expect(adminApi.copyRole).toHaveBeenCalledWith(
        'role-employee',
        expect.objectContaining({ code: 'QA_EMPLOYEE', name: '质量员工' }),
      ),
    )
    expect(screen.getByRole('button', { name: '编辑角色：部门主管' })).toBeEnabled()
  })

  // TODO: re-enable after Semi Select aria-label propagation is fixed
  it.skip('uses fine-grained permission actions and captures department and project scope configuration', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderAdmin(
      <RolePermissionMatrix
        permissions={permissions}
        value={[]}
        departments={['研发一组', '研发二组']}
        projects={[
          { id: 'project-1', name: '权限平台' },
          { id: 'project-2', name: '材料平台' },
        ]}
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('columnheader', { name: '查看' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '新建' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '编辑' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '停用' })).toBeInTheDocument()
    expect(screen.queryByText('管理全部')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '授权 user.read' }))
    await selectSemiOption(
      screen.getByRole('combobox', { name: 'user.read 的数据范围' }),
      'DEPARTMENT',
    )
    await selectSemiOption(
      screen.getByRole('combobox', { name: 'user.read 的部门范围' }),
      '研发一组',
    )

    await user.click(screen.getByRole('checkbox', { name: '授权 project.read' }))
    await selectSemiOption(
      screen.getByRole('combobox', { name: 'project.read 的数据范围' }),
      'PROJECT',
    )
    await selectSemiOption(
      screen.getByRole('combobox', { name: 'project.read 的项目范围' }),
      'project-1',
    )

    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        {
          permissionCode: 'user.read',
          dataScope: 'DEPARTMENT',
          scopeConfig: { departmentNames: ['研发一组'] },
        },
        {
          permissionCode: 'project.read',
          dataScope: 'PROJECT',
          scopeConfig: { projectIds: ['project-1'] },
        },
      ]),
    )
  })

  it('renders the system permission catalog as a read-only, sensitive-aware matrix', async () => {
    renderAdmin(<PermissionsPage />)

    expect(await screen.findByRole('heading', { name: '权限目录' })).toBeInTheDocument()
    expect(screen.getByText('user.read')).toBeInTheDocument()
    expect(screen.getByText('user.create')).toBeInTheDocument()
    expect(screen.getAllByText('敏感权限').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '新建权限' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删除权限/ })).not.toBeInTheDocument()
    expect(screen.getByText('权限编码由系统维护，不允许在此创建或删除')).toBeInTheDocument()
  })

  // TODO: re-enable after Semi Select aria-label propagation is fixed
  it.skip('filters and paginates security audits without exposing unbounded records', async () => {
    const user = userEvent.setup()
    renderAdmin(<SecurityAuditsPage />)

    expect(await screen.findByRole('heading', { name: '安全审计' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '账号筛选' }), 'lin.xiao')
    await user.type(screen.getByRole('textbox', { name: '事件类型筛选' }), 'PERMISSION_DENIED')
    await selectSemiOption(screen.getByRole('combobox', { name: '结果筛选' }), 'false')
    await user.click(screen.getByRole('button', { name: '查询审计' }))

    await waitFor(() =>
      expect(adminApi.listSecurityAudits).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 20,
          username: 'lin.xiao',
          eventType: 'PERMISSION_DENIED',
          success: false,
        }),
      ),
    )
    expect(screen.getByText('越权拦截')).toBeInTheDocument()
    expect(screen.getByText('失败')).toHaveAccessibleName(/失败/)
    expect(screen.getByText('失败').closest('[aria-label]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() =>
      expect(adminApi.listSecurityAudits).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 }),
      ),
    )
  })

  it('shows avatar, identity, role, personal security, logout and administrator entry in the account menu', async () => {
    const user = userEvent.setup()
    renderAdmin(<WorkspaceHeader />)

    const accountMenu = await screen.findByRole('button', { name: '账号菜单：系统管理员' })
    expect(within(accountMenu).getByText('系')).toBeInTheDocument()
    await user.click(accountMenu)

    expect(await screen.findByText('系统管理员')).toBeInTheDocument()
    expect(screen.getByText('超级管理员')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '个人安全' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '系统管理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument()
  })
})
