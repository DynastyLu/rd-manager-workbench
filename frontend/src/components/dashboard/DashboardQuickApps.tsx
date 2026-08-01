import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface QuickAppItem {
  title: string
  description: string
  to: string
  icon: ReactNode
}

interface DashboardQuickAppsProps {
  items: QuickAppItem[]
}

export function DashboardQuickApps({ items }: DashboardQuickAppsProps) {
  return (
    <div className="workspace-card dashboard-quick-apps">
      <h2 className="dashboard-quick-apps__title">常用应用</h2>
      <nav className="dashboard-quick-apps__grid" aria-label="常用应用">
        {items.map((item) => (
          <Link key={item.title} to={item.to} className="dashboard-quick-apps__item">
            <span className="dashboard-quick-apps__icon" aria-hidden="true">{item.icon}</span>
            <span className="dashboard-quick-apps__name">{item.title}</span>
            <span className="dashboard-quick-apps__desc">{item.description}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
