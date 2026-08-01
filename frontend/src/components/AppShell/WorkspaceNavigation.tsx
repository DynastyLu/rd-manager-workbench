import {
  IconBookOpenStroked,
  IconBriefcaseStroked,
  IconCalendarStroked,
  IconChecklistStroked,
  IconGridStroked,
  IconHomeStroked,
  IconSearchStroked,
  IconSetting,
  IconUserGroup,
} from '@douyinfe/semi-icons'
import { NavLink, useLocation } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser } from '@/modules/auth/types'
import type { NavigationIcon, NavigationItem } from '@/router/routes'

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

const navigationIcons: Record<NavigationIcon, typeof IconHomeStroked> = {
  home: IconHomeStroked,
  tasks: IconChecklistStroked,
  projects: IconBriefcaseStroked,
  employees: IconUserGroup,
  docs: IconBookOpenStroked,
  base: IconGridStroked,
  calendar: IconCalendarStroked,
  search: IconSearchStroked,
  settings: IconSetting,
}

function isActivePath(item: NavigationItem, pathname: string) {
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
    const NavigationIcon = navigationIcons[item.icon]

    return (
      <NavLink
        key={item.key}
        to={item.path}
        className={`workspace-navigation__link${active ? ' workspace-navigation__link--active' : ''}`}
        aria-current={active ? 'page' : undefined}
        title={item.title}
      >
        <span className="workspace-navigation__icon" aria-hidden="true">
          <NavigationIcon size="large" />
        </span>
        <span className="workspace-navigation__label">{item.title}</span>
      </NavLink>
    )
  }

  return (
    <nav className="workspace-navigation" aria-label="主导航">
      <div className="workspace-navigation__brand" aria-label="研发工作空间">
        <span className="workspace-navigation__brand-mark" aria-hidden="true">
          RD
        </span>
        <span className="workspace-navigation__brand-name">研发工作空间</span>
      </div>
      <div className="workspace-navigation__links">{visibleItems.map(renderItem)}</div>
    </nav>
  )
}
