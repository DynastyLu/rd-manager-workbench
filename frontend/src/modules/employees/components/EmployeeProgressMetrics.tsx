import { percentage } from '../format'
import type {
  EmployeeNextPlanMetrics,
  EmployeeProgressMetrics as EmployeeProgressMetricsValue,
} from '../types'
import './employee-progress.less'

interface EmployeeProgressMetricsProps {
  metrics: EmployeeProgressMetricsValue
  nextPlanMetrics?: EmployeeNextPlanMetrics
}

export function EmployeeProgressMetrics({
  metrics,
  nextPlanMetrics,
}: EmployeeProgressMetricsProps) {
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
  if (metrics.projectWorkCount !== undefined) {
    cards.splice(1, 0, { label: '项目工作', value: String(metrics.projectWorkCount) })
  }
  if (metrics.nonProjectWorkCount !== undefined) {
    cards.splice(2, 0, { label: '非项目工作', value: String(metrics.nonProjectWorkCount) })
  }
  if (metrics.overdueCount !== undefined) {
    cards.push({
      label: '逾期',
      value: String(metrics.overdueCount),
      tone: metrics.overdueCount > 0 ? 'danger' : undefined,
    })
  }
  if (metrics.hoursCompleteness !== undefined) {
    cards.push({ label: '工时完整度', value: percentage(metrics.hoursCompleteness) })
  }
  const nextCards = nextPlanMetrics
    ? [
        { label: '计划数', value: String(nextPlanMetrics.planCount) },
        { label: '高优计划', value: String(nextPlanMetrics.highPriorityCount) },
        { label: '协作需求', value: String(nextPlanMetrics.collaborationCount) },
        {
          label: '未承接',
          value: String(nextPlanMetrics.unmatchedCount),
          tone: nextPlanMetrics.unmatchedCount > 0 ? ('warning' as const) : undefined,
        },
        { label: '已取消', value: String(nextPlanMetrics.cancelledCount) },
      ]
    : []

  return (
    <div className="employee-progress-metric-groups" aria-label="周期指标">
      <dl className="employee-progress-metrics" aria-label="本周执行指标">
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
      {nextCards.length ? (
        <section className="employee-progress-next-metrics" aria-label="下周计划指标">
          <header>
            <span>下周计划</span>
            <small>未来计划不计入本周完成率</small>
          </header>
          <dl className="employee-progress-metrics">
            {nextCards.map((card) => (
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
        </section>
      ) : null}
    </div>
  )
}
