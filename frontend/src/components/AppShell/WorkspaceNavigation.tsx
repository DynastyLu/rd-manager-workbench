import { NavLink, useLocation } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser } from '@/modules/auth/types'
import type { NavigationItem } from '@/router/routes'
import { WorkspaceDockIcon } from './WorkspaceDockIcon'

interface WorkspaceNavigationProps {
  items: NavigationItem[]
}

const ADMIN_PERMISSION_CODES = new Set([
  'user.read',
  'user.create',
  'user.update',
  'user.disable',
  'role.read',
  'role.create',
  'role.update',
  'role.assign',
  'audit.read',
  'system.configure',
])

function canAccessAdmin(user: CurrentUser | undefined): boolean {
  if (!user) return false
  if (user.roleCodes.includes('SUPER_ADMIN')) return true
  return user.permissions.some((grant) => ADMIN_PERMISSION_CODES.has(grant.code))
}

function isActivePath(item: NavigationItem, pathname: string): boolean {
  if (pathname === item.path) return true
  if (item.path !== '/' && pathname.startsWith(`${item.path}/`)) return true
  if (item.key === 'admin' && pathname.startsWith(`${ROUTES.ADMIN}/`)) return true
  return false
}

export function WorkspaceNavigation({ items }: WorkspaceNavigationProps) {
  const { pathname } = useLocation()
  const user = useAuthStore((state) => state.user)
  const visibleItems = canAccessAdmin(user)
    ? [...items, { key: 'admin', title: '系统管理', icon: 'settings' as const, path: ROUTES.ADMIN_USERS }]
    : items

  function renderItem(item: NavigationItem) {
    const active = isActivePath(item, pathname)

    return (
      <NavLink
        key={item.key}
        to={item.path}
        className={`workspace-dock__item${active ? ' workspace-dock__item--active' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-label={item.title}
        title={item.title}
      >
        <span className="workspace-dock__tile" aria-hidden="true">
          <span className="workspace-dock__icon">
            <WorkspaceDockIcon icon={item.icon} />
          </span>
        </span>
        <span className="workspace-dock__label">{item.title}</span>
        {active && <span className="workspace-dock__dot" aria-hidden="true" />}
      </NavLink>
    )
  }

  return (
    <nav className="workspace-dock" aria-label="主导航">
      <div className="workspace-dock__brand" aria-label="研发工作空间">
        <span className="workspace-dock__brand-mark" aria-hidden="true">
          RD
        </span>
      </div>
      <div className="workspace-dock__items">{visibleItems.map(renderItem)}</div>
    </nav>
  )
}
