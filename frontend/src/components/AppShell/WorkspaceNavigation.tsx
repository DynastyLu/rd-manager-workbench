import { useMotionValue } from 'framer-motion'
import { Fragment, type PointerEvent } from 'react'
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

type DockGroupKey = 'core' | 'content' | 'tools' | 'other'

interface DockGroup {
  key: DockGroupKey
  items: NavigationItem[]
}

const DOCK_GROUP_ITEMS: Record<Exclude<DockGroupKey, 'other'>, ReadonlySet<string>> = {
  core: new Set(['home', 'my-work', 'projects', 'employees']),
  content: new Set(['docs', 'base', 'calendar']),
  tools: new Set(['search', 'admin']),
}

function groupNavigationItems(items: NavigationItem[]): DockGroup[] {
  const groupedKeys = new Set(Object.values(DOCK_GROUP_ITEMS).flatMap((keys) => [...keys]))
  const groups = (Object.keys(DOCK_GROUP_ITEMS) as Exclude<DockGroupKey, 'other'>[]).map((key) => ({
    key,
    items: items.filter((item) => DOCK_GROUP_ITEMS[key].has(item.key)),
  }))
  const ungroupedItems = items.filter((item) => !groupedKeys.has(item.key))

  return ungroupedItems.length > 0
    ? [...groups, { key: 'other', items: ungroupedItems }]
    : groups
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
  const updatePointer = (event: PointerEvent<HTMLElement>) => {
    const isInsideStableSlot = [...event.currentTarget.querySelectorAll('.workspace-dock__slot')].some(
      (slot) => {
        const rect = slot.getBoundingClientRect()
        return event.clientY >= rect.top && event.clientY <= rect.bottom
      },
    )
    if (isInsideStableSlot) {
      mouseY.set(event.clientY)
      return
    }
    resetPointer()
  }

  return (
    <nav
      className="workspace-dock"
      aria-label="主导航"
      onPointerMove={updatePointer}
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
          {groups.map((group) => (
            <Fragment key={group.key}>
              {group.key === 'tools' && (
                <span className="workspace-dock__separator" aria-hidden="true" />
              )}
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
