import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser } from '@/modules/auth/types'
import { primaryNavigation } from '@/router/routes'
import { WorkspaceNavigation } from '../WorkspaceNavigation'

const employee: CurrentUser = {
  id: 'user-employee',
  username: 'employee',
  status: 'ACTIVE',
  mustChangePassword: false,
  permissionVersion: 1,
  resourceProfileId: 'profile-employee',
  displayName: '普通员工',
  roleCodes: ['EMPLOYEE'],
  permissions: [
    { code: 'project.read', dataScope: 'INVOLVED' },
    { code: 'task.read', dataScope: 'INVOLVED' },
  ],
}

const superAdmin: CurrentUser = {
  ...employee,
  id: 'user-admin',
  username: 'admin',
  resourceProfileId: 'profile-admin',
  displayName: '系统管理员',
  roleCodes: ['SUPER_ADMIN'],
  permissions: [{ code: 'user.read', dataScope: 'ALL' }],
}

describe('WorkspaceNavigation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user: employee,
    })
  })

  it('renders the eight core apps with project-owned icons and no planning badges', () => {
    const { container } = render(
      <MemoryRouter>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>
    )

    const navigation = screen.getByRole('navigation', { name: '主导航' })
    expect(screen.getAllByRole('link')).toHaveLength(8)
    expect(navigation).not.toHaveTextContent('设置')
    expect(navigation).not.toHaveTextContent('规划中')
    expect(container.querySelectorAll('[data-dock-icon]')).toHaveLength(8)
    expect(container.querySelectorAll('.semi-icon')).toHaveLength(0)
  })

  it('uses a distinct project-owned icon for every administrator app', () => {
    useAuthStore.setState({ user: superAdmin })
    const { container } = render(
      <MemoryRouter>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>,
    )

    const iconNames = [...container.querySelectorAll('[data-dock-icon]')].map((node) =>
      node.getAttribute('data-dock-icon'),
    )
    expect(iconNames).toHaveLength(9)
    expect(new Set(iconNames).size).toBe(9)
  })

  it('renders the employee app immediately after projects', () => {
    render(
      <MemoryRouter>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>
    )

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      '工作台',
      '我的工作',
      '项目',
      '员工',
      '文档与知识库',
      '多维表格',
      '日历',
      '搜索',
    ])
  })

  it('groups core, content and tool apps without changing their order', () => {
    useAuthStore.setState({ user: superAdmin })
    const { container } = render(
      <MemoryRouter>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>,
    )

    expect(container.querySelectorAll('[data-dock-group]')).toHaveLength(3)
    expect(container.querySelector('[data-dock-group="core"]')).toHaveTextContent(
      '工作台我的工作项目员工',
    )
    expect(container.querySelector('[data-dock-group="content"]')).toHaveTextContent(
      '文档与知识库多维表格日历',
    )
    expect(container.querySelector('[data-dock-group="tools"]')).toHaveTextContent(
      '搜索系统管理',
    )
    expect(container.querySelectorAll('.workspace-dock__separator')).toHaveLength(1)
  })

  it('marks the current core app with aria-current, including nested paths', () => {
    render(
      <MemoryRouter initialEntries={['/docs/project-alpha']}>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: '文档与知识库' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: '工作台' })).not.toHaveAttribute('aria-current')
  })

  it('hides system management from ordinary employees even when navigation items are shared', () => {
    render(
      <MemoryRouter>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: '系统管理' })).not.toBeInTheDocument()
  })

  it('shows system management to a super administrator', () => {
    useAuthStore.setState({ user: superAdmin })

    render(
      <MemoryRouter>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '系统管理' })).toHaveAttribute(
      'href',
      '/admin/users',
    )
  })
})
