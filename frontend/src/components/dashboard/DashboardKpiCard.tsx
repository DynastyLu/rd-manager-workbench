import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface DashboardKpiCardProps {
  label: string
  value: number
  icon: ReactNode
  tone?: 'brand' | 'info' | 'warning' | 'danger'
}

const toneMap = {
  brand: 'dashboard-kpi-card--brand',
  info: 'dashboard-kpi-card--info',
  warning: 'dashboard-kpi-card--warning',
  danger: 'dashboard-kpi-card--danger',
}

function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(() => {
    if (typeof window === 'undefined') return 0
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? target : 0
  })
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    if (prefersReduced) {
      raf = requestAnimationFrame(() => setDisplay(target))
    } else {
      let start: number | null = null
      const step = (timestamp: number) => {
        if (start === null) start = timestamp
        const progress = Math.min((timestamp - start) / duration, 1)
        setDisplay(Math.floor(progress * target))
        if (progress < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return display
}

export function DashboardKpiCard({ label, value, icon, tone = 'brand' }: DashboardKpiCardProps) {
  const animated = useAnimatedNumber(value)
  return (
    <div
      className={`workspace-card dashboard-kpi-card ${toneMap[tone]}`}
      data-interactive="true"
    >
      <div className="dashboard-kpi-card__icon" aria-hidden="true">{icon}</div>
      <div className="dashboard-kpi-card__body">
        <strong className="dashboard-kpi-card__value">{animated}</strong>
        <span className="dashboard-kpi-card__label">{label}</span>
      </div>
    </div>
  )
}
