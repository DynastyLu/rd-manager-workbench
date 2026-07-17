import type { LucideIcon } from 'lucide-react'
import BellRingIcon from 'lucide-react/dist/esm/icons/bell-ring.js'
import BookOpenTextIcon from 'lucide-react/dist/esm/icons/book-open-text.js'
import BriefcaseBusinessIcon from 'lucide-react/dist/esm/icons/briefcase-business.js'
import ClipboardListIcon from 'lucide-react/dist/esm/icons/clipboard-list.js'
import FileBadgeIcon from 'lucide-react/dist/esm/icons/file-badge.js'
import HandshakeIcon from 'lucide-react/dist/esm/icons/handshake.js'
import LayoutDashboardIcon from 'lucide-react/dist/esm/icons/layout-dashboard.js'
import Settings2Icon from 'lucide-react/dist/esm/icons/settings-2.js'
import { NavLink } from 'react-router-dom'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface NavigationItem {
  label: string
  path: string
  icon: LucideIcon
  end?: boolean
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: '工作台', path: '/', icon: LayoutDashboardIcon, end: true },
  { label: '项目与任务', path: '/projects', icon: ClipboardListIcon },
  { label: '品种申报', path: '/varieties', icon: FileBadgeIcon },
  { label: '风险与决策', path: '/risks', icon: BookOpenTextIcon },
  { label: '合作方与会议', path: '/partners', icon: HandshakeIcon },
  { label: '行业情报', path: '/intelligence', icon: BriefcaseBusinessIcon },
  { label: '报表与提醒', path: '/reports', icon: BellRingIcon },
  { label: '设置', path: '/settings', icon: Settings2Icon },
]

export function AppSidebar() {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand" aria-label="研发主管本地工作台">
        <span className="brand-seal" aria-hidden="true">
          研
        </span>
        <span className="brand-copy">
          <strong>研发档案台</strong>
          <small>LOCAL WORKBENCH</small>
        </span>
      </div>

      <Separator className="sidebar-separator" />

      <nav className="sidebar-navigation" aria-label="主导航">
        {NAVIGATION_ITEMS.map(({ label, path, icon: Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) => cn('sidebar-link', isActive && 'sidebar-link--active')}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-note">
        <span className="sidebar-note__mark" aria-hidden="true" />
        <span>
          单机资料域
          <small>数据仅保存在本机</small>
        </span>
      </div>
    </aside>
  )
}
