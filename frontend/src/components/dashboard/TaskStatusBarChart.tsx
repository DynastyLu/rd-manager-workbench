import { useMemo } from 'react'

import { ReactECharts } from './ReactECharts'
import { readWorkspaceToken, useReducedMotion } from './chart-utils'
import type { WorkTask } from '@/modules/workbench/types'

interface TaskStatusBarChartProps {
  todayActions: WorkTask[]
  overdueTasks: WorkTask[]
}

export function TaskStatusBarChart({ todayActions, overdueTasks }: TaskStatusBarChartProps) {
  const counts = useMemo(() => {
    const all = [...todayActions, ...overdueTasks]
    return {
      TODO: all.filter((t) => t.status === 'TODO').length,
      IN_PROGRESS: all.filter((t) => t.status === 'IN_PROGRESS').length,
      BLOCKED: all.filter((t) => t.status === 'BLOCKED').length,
    }
  }, [todayActions, overdueTasks])

  const reducedMotion = useReducedMotion()

  const option = useMemo(() => {
    const getColor = (token: string) => readWorkspaceToken(token)

    return {
      animation: reducedMotion ? false : undefined,
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value', splitLine: { show: false } },
      yAxis: {
        type: 'category',
        data: ['待办', '进行中', '阻塞'],
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: [
            { value: counts.TODO, itemStyle: { color: getColor('--workspace-info') } },
            { value: counts.IN_PROGRESS, itemStyle: { color: getColor('--workspace-brand') } },
            { value: counts.BLOCKED, itemStyle: { color: getColor('--workspace-warning') } },
          ],
          barWidth: 16,
          itemStyle: { borderRadius: [0, 8, 8, 0] },
          label: { show: true, position: 'right' },
        },
      ],
    }
  }, [counts, reducedMotion])

  return (
    <div className="workspace-card dashboard-chart">
      <h2 className="dashboard-chart__title">任务状态分布</h2>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  )
}
