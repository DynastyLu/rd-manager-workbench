import type { ReactNode } from 'react'

interface DashboardWidgetProps {
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function DashboardWidget({ title, children, footer, className = '' }: DashboardWidgetProps) {
  return (
    <div className={`workspace-card dashboard-widget ${className}`}>
      <div className="dashboard-widget__header">
        <h2 className="dashboard-widget__title">{title}</h2>
      </div>
      <div className="dashboard-widget__body">{children}</div>
      {footer ? <div className="dashboard-widget__footer">{footer}</div> : null}
    </div>
  )
}
