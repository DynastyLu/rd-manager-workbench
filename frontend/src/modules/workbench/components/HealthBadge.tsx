import { Tag } from '@douyinfe/semi-ui'
import type { ProjectHealth } from '@/modules/workbench/types'

const HEALTH_LABELS: Record<ProjectHealth, string> = {
  GREEN: '正常',
  YELLOW: '关注',
  RED: '风险',
}

const HEALTH_COLORS = {
  GREEN: 'green',
  YELLOW: 'amber',
  RED: 'red',
} as const

export function HealthBadge({ health }: { health: ProjectHealth }) {
  return (
    <Tag
      className={`health-badge health-badge--${health.toLowerCase()}`}
      color={HEALTH_COLORS[health]}
    >
      {HEALTH_LABELS[health]}
    </Tag>
  )
}
