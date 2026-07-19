import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GanttView } from '../components/GanttView'
import { resizeRange, shiftRange } from '../components/GanttTimeline'
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

function renderGantt(
  overrides: Partial<React.ComponentProps<typeof GanttView>> = {}
) {
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
    expect(
      shiftRange('2026-07-20T09:00:00.000Z', '2026-07-22T09:00:00.000Z', 2)
    ).toEqual({
      start: '2026-07-22T09:00:00.000Z',
      end: '2026-07-24T09:00:00.000Z',
    })
    expect(
      resizeRange(
        '2026-07-20T09:00:00.000Z',
        '2026-07-22T09:00:00.000Z',
        'start',
        1
      )
    ).toEqual({
      start: '2026-07-21T09:00:00.000Z',
      end: '2026-07-22T09:00:00.000Z',
    })
    expect(
      resizeRange(
        '2026-07-20T09:00:00.000Z',
        '2026-07-22T09:00:00.000Z',
        'end',
        -3
      )
    ).toBeNull()
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

  it('keeps preset rows read-only when either date field disallows its record type', () => {
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
    renderGantt({ fields: readOnlyFields, records: [meeting] })

    expect(screen.getByTestId('gantt-bar-scheduled')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByLabelText('调整“研发周会”的开始时间')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('调整“研发周会”的结束时间')).not.toBeInTheDocument()
  })

  it.each([
    ['move', 'gantt-bar-scheduled', 40, {
      startAt: '2026-07-21T09:00:00.000Z',
      endAt: '2026-07-23T09:00:00.000Z',
    }],
    ['start resize', '调整“完成评审”的开始时间', 40, {
      startAt: '2026-07-21T09:00:00.000Z',
      endAt: '2026-07-22T09:00:00.000Z',
    }],
    ['end resize', '调整“完成评审”的结束时间', 40, {
      startAt: '2026-07-20T09:00:00.000Z',
      endAt: '2026-07-23T09:00:00.000Z',
    }],
  ])('writes ISO values after %s', async (_, target, distance, expected) => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    renderGantt({ records: [records[0]!], onRecordChange })

    const element = target.startsWith('gantt-')
      ? screen.getByTestId(target)
      : screen.getByLabelText(target)
    drag(element, 100, 100 + distance)

    await waitFor(() =>
      expect(onRecordChange).toHaveBeenCalledWith('scheduled', expected)
    )
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
