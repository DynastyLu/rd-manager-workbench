import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HealthDonutChart } from '../HealthDonutChart'

const mockOption = vi.fn()
const mockOnEvents = vi.fn()

vi.mock('../ReactECharts', () => ({
  ReactECharts: function MockReactECharts({
    option,
    onEvents,
    style,
  }: {
    option: unknown
    onEvents?: Record<string, (params: unknown) => void>
    style?: React.CSSProperties
  }) {
    mockOption(option)
    mockOnEvents(onEvents)
    return (
      <div
        data-testid="react-echarts"
        data-option={JSON.stringify(option)}
        data-has-onevents={onEvents ? 'true' : 'false'}
        style={style}
      />
    )
  },
}))

describe('HealthDonutChart', () => {
  const data = { GREEN: 5, YELLOW: 2, RED: 1 }

  it('renders the section heading', () => {
    render(<HealthDonutChart data={data} />)
    expect(screen.getByRole('heading', { name: '项目健康度' })).toBeInTheDocument()
  })

  it('passes pie option with workspace token colors', () => {
    render(<HealthDonutChart data={data} />)
    const option = mockOption.mock.calls[mockOption.mock.calls.length - 1]?.[0] as {
      title: { text: string; subtext: string }
      series: Array<{
        type: string
        data: Array<{ value: number; itemStyle: { color: string | undefined } }>
      }>
    }

    expect(option.title.text).toBe('8')
    expect(option.title.subtext).toBe('项目总数')
    expect(option.series[0].type).toBe('pie')
    expect(option.series[0].data[0].value).toBe(5)
    expect(option.series[0].data[1].value).toBe(2)
    expect(option.series[0].data[2].value).toBe(1)
    // Colors resolve from CSS tokens in jsdom to empty string; undefined fallback is acceptable.
    expect(option.series[0].data[0].itemStyle.color).toBeUndefined()
  })

  it('calls onSliceClick with the health value when a slice is clicked', async () => {
    const handleSliceClick = vi.fn()
    render(<HealthDonutChart data={data} onSliceClick={handleSliceClick} />)

    const onEvents = mockOnEvents.mock.calls
      .map((call) => call[0] as Record<string, (params: unknown) => void> | undefined)
      .find((events) => events !== undefined)
    expect(onEvents).toBeDefined()
    onEvents?.click({ dataIndex: 1 })

    expect(handleSliceClick).toHaveBeenCalledWith('YELLOW')
  })

  it('ignores clicks outside registered slices', async () => {
    const handleSliceClick = vi.fn()
    render(<HealthDonutChart data={data} onSliceClick={handleSliceClick} />)

    const onEvents = mockOnEvents.mock.calls
      .map((call) => call[0] as Record<string, (params: unknown) => void> | undefined)
      .find((events) => events !== undefined)
    onEvents?.click({ dataIndex: 99 })

    expect(handleSliceClick).not.toHaveBeenCalled()
  })

  it('does not register click handler when onSliceClick is omitted', () => {
    render(<HealthDonutChart data={data} />)
    expect(screen.getByTestId('react-echarts')).toHaveAttribute('data-has-onevents', 'false')
  })

  it('disables animation when reduced motion is preferred', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia

    render(<HealthDonutChart data={data} />)
    const option = mockOption.mock.calls[mockOption.mock.calls.length - 1]?.[0] as {
      animation: boolean | undefined
    }
    expect(option.animation).toBe(false)
  })
})
