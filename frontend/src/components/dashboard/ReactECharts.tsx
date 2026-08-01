import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { PieChart, BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  PieChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
])

export type EChartsOption = echarts.EChartsCoreOption

export type EChartsEventHandler = (params: unknown) => void

interface ReactEChartsProps {
  option: EChartsOption
  className?: string
  style?: React.CSSProperties
  onEvents?: Record<string, EChartsEventHandler>
}

export function ReactECharts({ option, className, style, onEvents }: ReactEChartsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.EChartsType | null>(null)
  const onEventsRef = useRef(onEvents)

  useEffect(() => {
    onEventsRef.current = onEvents
  }, [onEvents])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chartRef.current = chart

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    const currentEvents = onEventsRef.current
    if (currentEvents) {
      for (const [eventName, handler] of Object.entries(currentEvents)) {
        chart.on(eventName, handler)
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      if (currentEvents) {
        for (const [eventName, handler] of Object.entries(currentEvents)) {
          chart.off(eventName, handler)
        }
      }
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={containerRef} className={className} style={style} />
}

export default ReactECharts
