import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'

import { ViewSettingsDrawer } from '../components/ViewSettingsDrawer'
import type { DataField, DataView, DataViewConfig } from '../types'

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
    id: 'field-summary',
    tableId: 'table-1',
    key: 'summary',
    name: '摘要',
    type: 'LONG_TEXT',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 1,
    createdAt: '',
    updatedAt: '',
  },
  ...(['startAt', 'endAt', 'plannedAt'] as const).map((key, index): DataField => ({
    id: `field-${key}`,
    tableId: 'table-1',
    key,
    name: index === 0 ? '开始时间' : index === 1 ? '结束时间' : '计划时间',
    type: 'DATETIME',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: index + 2,
    createdAt: '',
    updatedAt: '',
  })),
  {
    id: 'field-created',
    tableId: 'table-1',
    key: 'createdAt',
    name: '创建时间',
    type: 'CREATED_AT',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 5,
    createdAt: '',
    updatedAt: '',
  },
]

function ganttView(id: string, config: DataViewConfig): DataView {
  return {
    id,
    tableId: 'table-1',
    name: id === 'gantt-a' ? '研发排期' : '里程碑',
    type: 'GANTT',
    config,
    isDefault: id === 'gantt-a',
    sequence: 0,
    createdAt: '',
    updatedAt: '',
  }
}

function drawer(view: DataView, onConfigChange = vi.fn()) {
  return (
    <ViewSettingsDrawer
      visible
      view={view}
      fields={fields}
      onClose={vi.fn()}
      onConfigChange={onConfigChange}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onSetDefault={vi.fn()}
    />
  )
}

describe('Gantt view settings', () => {
  it('changes configured start and end fields and allows the same datetime field', async () => {
    const onConfigChange = vi.fn()
    render(drawer(ganttView('gantt-a', {
      titleFieldKey: 'title',
      startFieldKey: 'startAt',
      endFieldKey: 'endAt',
      scale: 'WEEK',
      rowHeight: 'STANDARD',
    }), onConfigChange))

    const startSelect = screen.getByRole('combobox', { name: '甘特开始字段' })
    const endSelect = screen.getByRole('combobox', { name: '甘特结束字段' })
    expect(startSelect).toHaveTextContent('开始时间')
    expect(endSelect).toHaveTextContent('结束时间')

    await selectSemiOption(startSelect, 'plannedAt')
    await selectSemiOption(endSelect, 'plannedAt')

    expect(onConfigChange).toHaveBeenLastCalledWith(expect.objectContaining({
      startFieldKey: 'plannedAt',
      endFieldKey: 'plannedAt',
    }))
  })

  it('saves title, scale, and row density and restores each view configuration', async () => {
    const onConfigChange = vi.fn()
    const originalA = {
      titleFieldKey: 'title',
      startFieldKey: 'startAt',
      endFieldKey: 'endAt',
      scale: 'WEEK' as const,
      rowHeight: 'STANDARD' as const,
    }
    const { rerender } = render(drawer(ganttView('gantt-a', originalA), onConfigChange))

    const titleSelect = screen.getByRole('combobox', { name: '甘特标题字段' })
    expect(titleSelect).toHaveTextContent(/事项.*主字段/)
    await selectSemiOption(titleSelect, 'summary')
    await selectSemiOption(screen.getByRole('combobox', { name: '时间缩放' }), 'MONTH')
    await selectSemiOption(screen.getByRole('combobox', { name: '行高' }), 'COMPACT')

    const savedA = onConfigChange.mock.calls.at(-1)?.[0] as DataViewConfig
    expect(savedA).toEqual(expect.objectContaining({
      titleFieldKey: 'summary',
      scale: 'MONTH',
      rowHeight: 'COMPACT',
    }))

    rerender(drawer(ganttView('gantt-b', {
      titleFieldKey: 'title',
      startFieldKey: 'plannedAt',
      endFieldKey: 'plannedAt',
      scale: 'DAY',
      rowHeight: 'STANDARD',
    }), onConfigChange))
    expect(screen.getByRole('combobox', { name: '甘特标题字段' })).toHaveTextContent('事项')
    expect(screen.getByRole('combobox', { name: '甘特开始字段' })).toHaveTextContent('计划时间')
    expect(screen.getByRole('combobox', { name: '甘特结束字段' })).toHaveTextContent('计划时间')
    expect(screen.getByRole('combobox', { name: '时间缩放' })).toHaveTextContent('日')
    expect(screen.getByRole('combobox', { name: '行高' })).toHaveTextContent('标准')

    rerender(drawer(ganttView('gantt-a', savedA), onConfigChange))
    expect(screen.getByRole('combobox', { name: '甘特标题字段' })).toHaveTextContent('摘要')
    expect(screen.getByRole('combobox', { name: '时间缩放' })).toHaveTextContent('月')
    expect(screen.getByRole('combobox', { name: '行高' })).toHaveTextContent('紧凑')

    // A rejected optimistic save is supplied back through view.config by LibraryHomePage.
    rerender(drawer(ganttView('gantt-a', { ...originalA }), onConfigChange))
    expect(screen.getByRole('combobox', { name: '甘特标题字段' })).toHaveTextContent('事项')
    expect(screen.getByRole('combobox', { name: '时间缩放' })).toHaveTextContent('周')
    expect(screen.getByRole('combobox', { name: '行高' })).toHaveTextContent('标准')
  })
})
