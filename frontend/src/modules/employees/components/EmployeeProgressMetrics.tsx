import type { EmployeeProgressMetrics as EmployeeProgressMetricsValue } from '../types'
import './employee-progress.less'

const percentage = (value: number | null) => (value === null ? '暂无数据' : `${value}%`)

export function EmployeeProgressMetrics({ metrics }: { metrics: EmployeeProgressMetricsValue }) {
  const cards: Array<{ label: string; value: string; tone?: 'danger' | 'warning' }> = [
    { label: '工作项', value: String(metrics.workItemCount) },
    { label: '平均完成度', value: percentage(metrics.averageCompletionRate) },
    { label: '完成率', value: percentage(metrics.completionRate) },
    { label: '计划工时', value: `${metrics.plannedHours} 小时` },
    { label: '实际工时', value: `${metrics.actualHours} 小时` },
    { label: '项目覆盖', value: String(metrics.projectCount) },
    { label: '风险', value: String(metrics.riskCount), tone: metrics.riskCount > 0 ? 'warning' : undefined },
    { label: '阻塞', value: String(metrics.blockedCount), tone: metrics.blockedCount > 0 ? 'danger' : undefined },
  ]

  return (
    <dl className="employee-progress-metrics" aria-label="周期指标">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`employee-progress-metrics__card${
            card.tone ? ` employee-progress-metrics__card--${card.tone}` : ''
          }`}
        >
          <dt>{card.label}</dt>
          <dd>{card.value}</dd>
        </div>
      ))}
    </dl>
  )
}
