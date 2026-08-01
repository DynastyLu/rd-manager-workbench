import { useMotionValue } from 'framer-motion'
import { Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser } from '@/modules/auth/types'
import type { NavigationItem } from '@/router/routes'
import { DockItem } from './DockItem'

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

type DockGroupKey = 'core' | 'content' | 'tools'

interface DockGroup {
  key: DockGroupKey
  items: NavigationItem[]
}

const DOCK_GROUP_ITEMS: Record<DockGroupKey, ReadonlySet<string>> = {
  core: new Set(['home', 'my-work', 'projects', 'employees']),
  content: new Set(['docs', 'base', 'calendar']),
  tools: new Set(['search', 'admin']),
}

function groupNavigationItems(items: NavigationItem[]): DockGroup[] {
  return (Object.keys(DOCK_GROUP_ITEMS) as DockGroupKey[]).map((key) => ({
    key,
    items: items.filter((item) => DOCK_GROUP_ITEMS[key].has(item.key)),
  }))
}

export function WorkspaceNavigation({ items }: WorkspaceNavigationProps) {
  const { pathname } = useLocation()
  const user = useAuthStore((state) => state.user)
  const mouseY = useMotionValue(Number.POSITIVE_INFINITY)
  const visibleItems = canAccessAdmin(user)
    ? [...items, { key: 'admin', title: '系统管理', icon: 'settings' as const, path: ROUTES.ADMIN_USERS }]
    : items
  const groups = groupNavigationItems(visibleItems)

  const resetPointer = () => mouseY.set(Number.POSITIVE_INFINITY)

  return (
    <nav
      className="workspace-dock"
      aria-label="主导航"
      onPointerMove={(event) => mouseY.set(event.clientY)}
      onPointerLeave={resetPointer}
      onPointerCancel={resetPointer}
    >
      <div className="workspace-dock__scroll">
        <div className="workspace-dock__brand" aria-label="研发工作空间">
          <span className="workspace-dock__brand-mark" aria-hidden="true">
            RD
          </span>
        </div>
        <div className="workspace-dock__items">
          {groups.map((group, index) => (
            <Fragment key={group.key}>
              {index === 2 && <span className="workspace-dock__separator" aria-hidden="true" />}
              <div className="workspace-dock__group" data-dock-group={group.key}>
                {group.items.map((item) => (
                  <DockItem
                    key={item.key}
                    item={item}
                    active={isActivePath(item, pathname)}
                    mouseY={mouseY}
                  />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </nav>
  )
}
