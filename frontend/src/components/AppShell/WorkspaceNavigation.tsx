import {
  IconBookOpenStroked,
  IconBriefcaseStroked,
  IconCalendarStroked,
  IconChecklistStroked,
  IconGridStroked,
  IconHomeStroked,
  IconSearchStroked,
} from '@douyinfe/semi-icons'
import { NavLink, useLocation } from 'react-router-dom'
import type { NavigationIcon, NavigationItem } from '@/router/routes'

interface WorkspaceNavigationProps {
  items: NavigationItem[]
}

const navigationIcons: Record<NavigationIcon, typeof IconHomeStroked> = {
  home: IconHomeStroked,
  tasks: IconChecklistStroked,
  projects: IconBriefcaseStroked,
  docs: IconBookOpenStroked,
  base: IconGridStroked,
  calendar: IconCalendarStroked,
  search: IconSearchStroked,
}

function isActivePath(item: NavigationItem, pathname: string) {
  return pathname === item.path || (item.path !== '/' && pathname.startsWith(`${item.path}/`))
}

export function WorkspaceNavigation({ items }: WorkspaceNavigationProps) {
  const { pathname } = useLocation()

  function renderItem(item: NavigationItem) {
    const active = isActivePath(item, pathname)
    const NavigationIcon = navigationIcons[item.icon]

    return (
      <NavLink
        key={item.key}
        to={item.path}
        className={`workspace-navigation__link${active ? ' workspace-navigation__link--active' : ''}`}
        aria-current={active ? 'page' : undefined}
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
      <div className="workspace-navigation__links">{items.map(renderItem)}</div>
    </nav>
  )
}
