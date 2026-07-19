import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GanttView } from '../components/GanttView'
import {
  resizeRange,
  resizeRangeForScale,
  shiftRange,
  shiftRangeForScale,
} from '../components/GanttTimeline'
import type { BaseRecord, DataField, GanttViewConfig } from '../types'

const fields: DataField[] = [
  {
    id: 'field-title',
    tableId: 'table-1',
    key: 'title',
    name: '事项',
    type: 'TEXT',
    config: {},
    isPrimary: true,
    isRequired: true,
    sequence: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'field-start',
    tableId: 'table-1',
    key: 'startAt',
    name: '开始时间',
    type: 'DATETIME',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'field-end',
    tableId: 'table-1',
    key: 'endAt',
    name: '结束时间',
    type: 'DATETIME',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 2,
    createdAt: '',
    updatedAt: '',
  },
]

const config: GanttViewConfig = {
  titleFieldKey: 'title',
  startFieldKey: 'startAt',
  endFieldKey: 'endAt',
  scale: 'DAY',
}

const records: BaseRecord[] = [
  {
    id: 'scheduled',
    values: {
      title: '完成评审',
      startAt: '2026-07-20T09:00:00.000Z',
      endAt: '2026-07-22T09:00:00.000Z',
    },
    sourceType: null,
    sourceId: null,
    sourcePath: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'unplanned',
    values: { title: '等待排期', startAt: '2026-07-25T09:00:00.000Z', endAt: null },
    sourceType: null,
    sourceId: null,
    sourcePath: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'invalid',
    values: {
      title: '日期异常',
      startAt: '2026-07-26T09:00:00.000Z',
      endAt: '2026-07-24T09:00:00.000Z',
    },
    sourceType: null,
    sourceId: null,
    sourcePath: null,
    createdAt: '',
    updatedAt: '',
  },
]

function renderGantt(overrides: Partial<React.ComponentProps<typeof GanttView>> = {}) {
  return render(
    <GanttView
      fields={fields}
      records={records}
      config={config}
      onConfigChange={vi.fn()}
      onRecordChange={vi.fn().mockResolvedValue(undefined)}
      onOpenRecord={vi.fn()}
      {...overrides}
    />
  )
}

function drag(element: HTMLElement, startX: number, endX: number) {
  fireEvent.pointerDown(element, { pointerId: 1, clientX: startX, button: 0 })
  fireEvent.pointerMove(element, { pointerId: 1, clientX: endX })
  fireEvent.pointerUp(element, { pointerId: 1, clientX: endX })
}

describe('Gantt date helpers', () => {
  it('shifts both dates and resizes one edge without mutating the other', () => {
    expect(shiftRange('2026-07-20T09:00:00.000Z', '2026-07-22T09:00:00.000Z', 2)).toEqual({
      start: '2026-07-22T09:00:00.000Z',
      end: '2026-07-24T09:00:00.000Z',
    })
    expect(resizeRange('2026-07-20T09:00:00.000Z', '2026-07-22T09:00:00.000Z', 'start', 1)).toEqual(
      {
        start: '2026-07-21T09:00:00.000Z',
        end: '2026-07-22T09:00:00.000Z',
      }
    )
    expect(
      resizeRange('2026-07-20T09:00:00.000Z', '2026-07-22T09:00:00.000Z', 'end', -3)
    ).toBeNull()
  })

  it('moves month-scale ranges by natural calendar months at month end and leap year', () => {
    expect(
      shiftRangeForScale('2024-01-31T01:00:00.000Z', '2024-02-29T01:00:00.000Z', 1, 'MONTH')
    ).toEqual({
      start: '2024-02-29T01:00:00.000Z',
      end: '2024-03-29T01:00:00.000Z',
    })
    expect(
      resizeRangeForScale(
        '2025-01-31T01:00:00.000Z',
        '2025-03-31T01:00:00.000Z',
        'start',
        1,
        'MONTH'
      )
    ).toEqual({
      start: '2025-02-28T01:00:00.000Z',
      end: '2025-03-31T01:00:00.000Z',
    })
  })

  it('preserves local wall-clock time across a daylight-saving calendar day', () => {
    const originalTimeZone = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(shiftRange('2026-03-07T17:00:00.000Z', '2026-03-08T16:00:00.000Z', 1)).toEqual({
        start: '2026-03-08T16:00:00.000Z',
        end: '2026-03-09T16:00:00.000Z',
      })
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimeZone
    }
  })

  it('uses the Asia/Shanghai local calendar when moving a date across midnight UTC', () => {
    const originalTimeZone = process.env.TZ
    process.env.TZ = 'Asia/Shanghai'
    try {
      expect(shiftRange('2026-01-31T16:30:00.000Z', '2026-02-01T16:30:00.000Z', 1)).toEqual({
        start: '2026-02-01T16:30:00.000Z',
        end: '2026-02-02T16:30:00.000Z',
      })
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimeZone
    }
  })
})

describe('GanttView', () => {
  it('asks for two datetime fields when the view is not configured', () => {
    renderGantt({ config: { titleFieldKey: 'title' } })

    expect(screen.getByRole('status')).toHaveTextContent('请先配置开始时间和结束时间')
    expect(screen.queryByTestId('gantt-timeline')).not.toBeInTheDocument()
  })

  it('separates unplanned rows and shows an inline error for reversed dates', () => {
    renderGantt()

    expect(screen.getByRole('heading', { name: '未排期 1' })).toBeInTheDocument()
    expect(within(screen.getByTestId('gantt-unplanned')).getByText('等待排期')).toBeInTheDocument()
    expect(screen.getByText('结束时间早于开始时间')).toBeInTheDocument()
    expect(screen.queryByTestId('gantt-bar-invalid')).not.toBeInTheDocument()
    expect(screen.getByTestId('gantt-bar-scheduled')).toBeInTheDocument()
  })

  it('keeps the frozen record list vertically aligned with the scrollable timeline', () => {
    const { container } = renderGantt()
    const scroller = container.querySelector<HTMLElement>('.gantt-timeline__scroller')!
    const recordList = container.querySelector<HTMLElement>('.gantt-timeline__records')!

    scroller.scrollTop = 72
    fireEvent.scroll(scroller)

    expect(recordList.scrollTop).toBe(72)
  })

  it('switches between day, week, and month scales and renders today marker', async () => {
    const onConfigChange = vi.fn()
    const user = userEvent.setup()
    renderGantt({ config: { ...config, scale: undefined }, onConfigChange })

    expect(screen.getByRole('button', { name: '周' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/今天/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '日' }))
    await user.click(screen.getByRole('button', { name: '月' }))

    expect(onConfigChange).toHaveBeenNthCalledWith(1, expect.objectContaining({ scale: 'DAY' }))
    expect(onConfigChange).toHaveBeenNthCalledWith(2, expect.objectContaining({ scale: 'MONTH' }))
  })

  it('scrolls the timeline to the today marker when the view opens', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240)
    const { container } = renderGantt({ records: [records[0]!] })

    expect(
      container.querySelector<HTMLElement>('.gantt-timeline__scroller')?.scrollLeft
    ).toBeGreaterThan(0)
    width.mockRestore()
  })

  it('does not recenter after a same-scale record refetch but recenters after scale changes', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240)
    const { container, rerender } = renderGantt({ records: [records[0]!] })
    const scroller = container.querySelector<HTMLElement>('.gantt-timeline__scroller')!
    scroller.scrollLeft = 999

    rerender(
      <GanttView
        fields={fields}
        records={[
          {
            ...records[0]!,
            values: { ...records[0]!.values, startAt: '2025-01-01T09:00:00.000Z' },
          },
        ]}
        config={config}
        onConfigChange={vi.fn()}
        onRecordChange={vi.fn()}
        onOpenRecord={vi.fn()}
      />
    )
    expect(scroller.scrollLeft).toBe(999)

    rerender(
      <GanttView
        fields={fields}
        records={[records[0]!]}
        config={{ ...config, scale: 'MONTH' }}
        onConfigChange={vi.fn()}
        onRecordChange={vi.fn()}
        onOpenRecord={vi.fn()}
      />
    )
    expect(scroller.scrollLeft).not.toBe(999)
    width.mockRestore()
  })

  it('moves a one-day bar backed by the same start and end field', async () => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    const oneDayRecord: BaseRecord = {
      ...records[0]!,
      values: { title: '单日发布', startAt: '2026-07-20T09:00:00.000Z' },
    }
    renderGantt({
      records: [oneDayRecord],
      config: { ...config, startFieldKey: 'startAt', endFieldKey: 'startAt' },
      onRecordChange,
    })

    expect(screen.queryByLabelText('调整“单日发布”的开始时间')).not.toBeInTheDocument()
    drag(screen.getByTestId('gantt-bar-scheduled'), 100, 140)

    await waitFor(() =>
      expect(onRecordChange).toHaveBeenCalledWith('scheduled', {
        startAt: '2026-07-21T09:00:00.000Z',
      })
    )
  })

  it('cancels a pointer gesture without saving and clears its preview', () => {
    const onRecordChange = vi.fn()
    renderGantt({ records: [records[0]!], onRecordChange })
    const bar = screen.getByTestId('gantt-bar-scheduled')

    fireEvent.pointerDown(bar, { pointerId: 7, clientX: 100, button: 0 })
    fireEvent.pointerMove(bar, { pointerId: 7, clientX: 140 })
    expect(bar).toHaveAttribute('data-start', '2026-07-21T09:00:00.000Z')
    fireEvent.pointerCancel(bar, { pointerId: 7, clientX: 140 })

    expect(screen.getByTestId('gantt-bar-scheduled')).toHaveAttribute(
      'data-start',
      '2026-07-20T09:00:00.000Z'
    )
    expect(onRecordChange).not.toHaveBeenCalled()
  })

  it('supports keyboard move and edge resize and exposes the scale grid width', async () => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    renderGantt({ records: [records[0]!], onRecordChange })
    const timeline = screen.getByTestId('gantt-timeline')
    expect(timeline.style.getPropertyValue('--gantt-grid-size')).toBe('40px')

    fireEvent.keyDown(screen.getByTestId('gantt-bar-scheduled'), { key: 'ArrowRight' })
    await waitFor(() =>
      expect(onRecordChange).toHaveBeenNthCalledWith(1, 'scheduled', {
        startAt: '2026-07-21T09:00:00.000Z',
        endAt: '2026-07-23T09:00:00.000Z',
      })
    )
    fireEvent.keyDown(screen.getByLabelText('调整“完成评审”的结束时间'), { key: 'ArrowRight' })
    await waitFor(() =>
      expect(onRecordChange).toHaveBeenNthCalledWith(2, 'scheduled', {
        startAt: '2026-07-21T09:00:00.000Z',
        endAt: '2026-07-24T09:00:00.000Z',
      })
    )
  })

  it.each([
    ['DAY', '2027-07-20T09:00:00.000Z', '2027-08-20T09:00:00.000Z'],
    ['MONTH', '2031-07-20T09:00:00.000Z', '2032-07-20T09:00:00.000Z'],
  ] as const)(
    'keeps distant %s tasks at distinct timeline positions',
    (scale, firstDate, secondDate) => {
      const distantRecords: BaseRecord[] = [
        {
          ...records[0]!,
          id: 'far-1',
          values: { title: '远期一', startAt: firstDate, endAt: firstDate },
        },
        {
          ...records[0]!,
          id: 'far-2',
          values: { title: '远期二', startAt: secondDate, endAt: secondDate },
        },
      ]
      renderGantt({ records: distantRecords, config: { ...config, scale } })

      const firstLeft = Number.parseFloat(screen.getByTestId('gantt-bar-far-1').style.left)
      const secondLeft = Number.parseFloat(screen.getByTestId('gantt-bar-far-2').style.left)
      expect(secondLeft).toBeGreaterThan(firstLeft)
    }
  )

  it('shows the server total while all advanced-view pages are loading', () => {
    renderGantt({ records: [records[0]!], totalRecords: 240 })
    expect(screen.getByText('240 条记录')).toBeInTheDocument()
  })

  it('keeps preset rows read-only while retaining keyboard access to the record', () => {
    const readOnlyFields: DataField[] = [
      fields[0]!,
      {
        ...fields[1]!,
        config: { readOnlyRecordTypes: ['MEETING'] },
      },
      fields[2]!,
    ]
    const meeting = {
      ...records[0]!,
      values: { ...records[0]!.values, title: '研发周会', recordType: 'MEETING' },
      sourceType: 'MEETING',
      sourceId: 'meeting-1',
      sourcePath: '/meetings/meeting-1',
    }
    const onOpenRecord = vi.fn()
    renderGantt({ fields: readOnlyFields, records: [meeting], onOpenRecord })

    const bar = screen.getByTestId('gantt-bar-scheduled')
    expect(bar).not.toHaveAttribute('aria-disabled')
    expect(bar).toHaveAccessibleName(/只读/)
    expect(screen.queryByLabelText('调整“研发周会”的开始时间')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('调整“研发周会”的结束时间')).not.toBeInTheDocument()
    fireEvent.keyDown(bar, { key: 'Enter' })
    expect(onOpenRecord).toHaveBeenCalledWith(meeting)
  })

  it.each([
    [
      'move',
      'gantt-bar-scheduled',
      40,
      {
        startAt: '2026-07-21T09:00:00.000Z',
        endAt: '2026-07-23T09:00:00.000Z',
      },
    ],
    [
      'start resize',
      '调整“完成评审”的开始时间',
      40,
      {
        startAt: '2026-07-21T09:00:00.000Z',
        endAt: '2026-07-22T09:00:00.000Z',
      },
    ],
    [
      'end resize',
      '调整“完成评审”的结束时间',
      40,
      {
        startAt: '2026-07-20T09:00:00.000Z',
        endAt: '2026-07-23T09:00:00.000Z',
      },
    ],
  ])('writes ISO values after %s', async (_, target, distance, expected) => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    renderGantt({ records: [records[0]!], onRecordChange })

    const element = target.startsWith('gantt-')
      ? screen.getByTestId(target)
      : screen.getByLabelText(target)
    drag(element, 100, 100 + distance)

    await waitFor(() => expect(onRecordChange).toHaveBeenCalledWith('scheduled', expected))
  })

  it('rolls back the optimistic range and reports a failed update', async () => {
    let rejectUpdate: (reason?: unknown) => void = () => undefined
    const pending = new Promise<void>((_, reject) => {
      rejectUpdate = reject
    })
    renderGantt({
      records: [records[0]!],
      onRecordChange: vi.fn().mockReturnValue(pending),
    })

    const bar = screen.getByTestId('gantt-bar-scheduled')
    drag(bar, 100, 140)
    expect(bar).toHaveAttribute('data-start', '2026-07-21T09:00:00.000Z')

    rejectUpdate(new Error('offline'))

    await waitFor(() =>
      expect(screen.getByTestId('gantt-bar-scheduled')).toHaveAttribute(
        'data-start',
        '2026-07-20T09:00:00.000Z'
      )
    )
    expect(screen.getByRole('alert')).toHaveTextContent('日期更新失败，已恢复原时间')
  })

  it('opens the same record when its title or task bar is clicked', async () => {
    const onOpenRecord = vi.fn()
    const user = userEvent.setup()
    renderGantt({ records: [records[0]!], onOpenRecord })

    await user.click(screen.getByRole('button', { name: '打开记录：完成评审' }))
    await user.click(screen.getByTestId('gantt-bar-scheduled'))

    expect(onOpenRecord).toHaveBeenNthCalledWith(1, records[0])
    expect(onOpenRecord).toHaveBeenNthCalledWith(2, records[0])
  })
})
