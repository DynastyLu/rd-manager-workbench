import { useMemo } from 'react'

import { ReactECharts } from './ReactECharts'
import { readWorkspaceToken, useReducedMotion } from './chart-utils'
import type { EChartsEventHandler } from './ReactECharts'
import type { ProjectHealth } from '@/modules/workbench/types'

interface HealthDonutChartProps {
  data: Record<ProjectHealth, number>
  onSliceClick?: (health: ProjectHealth) => void
}

const HEALTH_ORDER: ProjectHealth[] = ['GREEN', 'YELLOW', 'RED']
const HEALTH_LABELS: Record<ProjectHealth, string> = {
  GREEN: '正常',
  YELLOW: '关注',
  RED: '风险',
}

export function HealthDonutChart({ data, onSliceClick }: HealthDonutChartProps) {
  const total = data.GREEN + data.YELLOW + data.RED
  const reducedMotion = useReducedMotion()

  const option = useMemo(() => {
    const getColor = (token: string) => readWorkspaceToken(token)

    return {
      animation: reducedMotion ? false : undefined,
      title: {
        text: `${total}`,
        subtext: '项目总数',
        left: 'center',
        top: 'center',
        textStyle: { fontSize: 28, fontWeight: 700, color: getColor('--workspace-text') },
        subtextStyle: { color: getColor('--workspace-text-secondary') },
      },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, left: 'center' },
      series: [
        {
          name: '项目健康度',
          type: 'pie',
          radius: ['45%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: getColor('--workspace-surface'),
            borderWidth: 2,
          },
          label: { show: false },
          data: [
            {
              value: data.GREEN,
              name: HEALTH_LABELS.GREEN,
              itemStyle: { color: getColor('--workspace-success') },
            },
            {
              value: data.YELLOW,
              name: HEALTH_LABELS.YELLOW,
              itemStyle: { color: getColor('--workspace-warning') },
            },
            {
              value: data.RED,
              name: HEALTH_LABELS.RED,
              itemStyle: { color: getColor('--workspace-danger') },
            },
          ],
        },
      ],
    }
  }, [data, total, reducedMotion])

  const onEvents = useMemo(() => {
    if (!onSliceClick) return undefined

    const handler: EChartsEventHandler = (params) => {
      const { dataIndex } = params as { dataIndex?: number }
      const health = typeof dataIndex === 'number' ? HEALTH_ORDER[dataIndex] : undefined
      if (health) {
        onSliceClick(health)
      }
    }

    return { click: handler }
  }, [onSliceClick])

  return (
    <div className="workspace-card dashboard-chart">
      <h2 className="dashboard-chart__title">项目健康度</h2>
      <ReactECharts option={option} style={{ height: 240 }} onEvents={onEvents} />
    </div>
  )
}
