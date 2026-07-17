import { Badge } from '@/components/ui/badge'
import type { ProjectHealth } from '@/modules/workbench/types'

const HEALTH_LABELS: Record<ProjectHealth, string> = {
  GREEN: '正常',
  YELLOW: '关注',
  RED: '风险',
}

const HEALTH_VARIANTS = {
  GREEN: 'default',
  YELLOW: 'secondary',
  RED: 'destructive',
} as const

export function HealthBadge({ health }: { health: ProjectHealth }) {
  return (
    <Badge
      className={`health-badge health-badge--${health.toLowerCase()}`}
      variant={HEALTH_VARIANTS[health]}
    >
      {HEALTH_LABELS[health]}
    </Badge>
  )
}
