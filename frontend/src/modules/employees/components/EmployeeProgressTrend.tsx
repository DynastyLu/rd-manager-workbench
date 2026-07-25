import { percentage } from '../format'
import './employee-progress.less'

export interface EmployeeProgressTrendPoint {
  periodStart: string
  label: string
  value: number | null
}

interface EmployeeProgressTrendProps {
  title?: string
  hint?: string
  points: EmployeeProgressTrendPoint[]
}

export function EmployeeProgressTrend({ title = '完成度趋势', hint, points }: EmployeeProgressTrendProps) {
  if (points.length === 0) return null

  return (
    <section className="employee-progress-trend" aria-label={title}>
      <h3>{title}</h3>
      <ul className="employee-progress-trend__bars">
        {points.map((point) => {
          const width = Math.max(0, Math.min(100, point.value ?? 0))
          return (
            <li key={point.periodStart}>
              <span className="employee-progress-trend__period">{point.label}</span>
              <span className="employee-progress-trend__track" aria-hidden="true">
                <span className="employee-progress-trend__bar" style={{ width: `${width}%` }} />
              </span>
              <span className="employee-progress-trend__value">{percentage(point.value)}</span>
            </li>
          )
        })}
      </ul>
      {hint ? <p className="employee-progress-trend__hint">{hint}</p> : null}
    </section>
  )
}
