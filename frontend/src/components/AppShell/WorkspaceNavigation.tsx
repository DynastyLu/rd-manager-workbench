import { NavLink, useLocation } from 'react-router-dom'
import type { NavigationItem } from '@/router/routes'

interface WorkspaceNavigationProps {
  items: NavigationItem[]
}

function isActivePath(item: NavigationItem, pathname: string) {
  return pathname === item.path || (item.path !== '/' && pathname.startsWith(`${item.path}/`))
}

export function WorkspaceNavigation({ items }: WorkspaceNavigationProps) {
  const { pathname } = useLocation()
  const settingsItem = items.find((item) => item.key === 'settings')
  const workspaceItems = items.filter((item) => item.key !== 'settings')

  function renderItem(item: NavigationItem) {
    const active = isActivePath(item, pathname)

    return (
      <NavLink
        key={item.key}
        to={item.path}
        className={`workspace-navigation__link${active ? ' workspace-navigation__link--active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className="workspace-navigation__icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="workspace-navigation__label">{item.title}</span>
        {item.availability === 'PLANNED' && (
          <span className="workspace-navigation__planned">规划中</span>
        )}
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
      <div className="workspace-navigation__links">{workspaceItems.map(renderItem)}</div>
      <div className="workspace-navigation__footer">{settingsItem && renderItem(settingsItem)}</div>
    </nav>
  )
}
