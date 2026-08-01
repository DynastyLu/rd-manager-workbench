import type { ReactNode } from 'react'

interface DashboardWidgetProps {
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  tone?: 'brand' | 'info' | 'warning' | 'danger'
}

const toneClassMap = {
  brand: 'dashboard-widget--tone-brand',
  info: 'dashboard-widget--tone-info',
  warning: 'dashboard-widget--tone-warning',
  danger: 'dashboard-widget--tone-danger',
} as const

export function DashboardWidget({ title, children, footer, className = '', tone }: DashboardWidgetProps) {
  const classes = ['workspace-card', 'dashboard-widget', tone && toneClassMap[tone], className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <div className="dashboard-widget__header">
        <h2 className="dashboard-widget__title">{title}</h2>
      </div>
      <div className="dashboard-widget__body">{children}</div>
      {footer ? <div className="dashboard-widget__footer">{footer}</div> : null}
    </div>
  )
}
