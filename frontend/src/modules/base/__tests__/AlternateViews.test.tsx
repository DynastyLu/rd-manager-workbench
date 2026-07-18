import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

const dndHarness = vi.hoisted(() => ({
  dragEnd: undefined as
    | ((event: { active: { id: string }; over: { id: string } | null }) => void)
    | undefined,
}))

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  const react = await vi.importActual<typeof import('react')>('react')

  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dndHarness.dragEnd = props.onDragEnd as typeof dndHarness.dragEnd
      return react.createElement(actual.DndContext, props)
    },
  }
})

import { CalendarView } from '../components/CalendarView'
import { FormView } from '../components/FormView'
import { KanbanView } from '../components/KanbanView'
import { ViewManager } from '../components/ViewManager'

const fields = [
  {
    id: 'field-title',
    tableId: 'table-1',
    name: '事项',
    key: 'title',
    type: 'TEXT' as const,
    config: {},
    isPrimary: true,
    isRequired: true,
    sequence: 0,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  },
  {
    id: 'field-status',
    tableId: 'table-1',
    name: '状态',
    key: 'status',
    type: 'SINGLE_SELECT' as const,
    config: {
      options: [
        { label: '待处理', value: 'TODO', color: '#8f959e' },
        { label: '进行中', value: 'DOING', color: '#3370ff' },
      ],
    },
    isPrimary: false,
    isRequired: false,
    sequence: 1,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  },
  {
    id: 'field-date',
    tableId: 'table-1',
    name: '截止日期',
    key: 'dueAt',
    type: 'DATETIME' as const,
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 2,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  },
  {
    id: 'field-done',
    tableId: 'table-1',
    name: '已确认',
    key: 'done',
    type: 'CHECKBOX' as const,
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 3,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  },
]

const records = [
  {
    id: 'record-1',
    values: {
      title: '完成评审',
      status: 'TODO',
      dueAt: '2026-07-22T09:00:00.000Z',
      done: false,
    },
    sourceType: null,
    sourceId: null,
    sourcePath: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  },
]

describe('KanbanView', () => {
  it('groups records by a single-select field and updates the same record when moved', async () => {
    const onRecordUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <KanbanView
        fields={fields}
        records={records}
        groupFieldKey="status"
        onRecordUpdate={onRecordUpdate}
      />
    )

    expect(screen.getByRole('heading', { name: '待处理 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '进行中 0' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: '移动“完成评审”' }), 'DOING')

    expect(onRecordUpdate).toHaveBeenCalledWith('record-1', {
      values: { status: 'DOING' },
    })
  })

  it('explains when no select field can be used for grouping', () => {
    render(
      <KanbanView
        fields={fields.filter((field) => field.type !== 'SINGLE_SELECT')}
        records={records}
        onRecordUpdate={vi.fn()}
      />
    )

    expect(screen.getByText('请先添加单选字段，再创建看板分组。')).toBeInTheDocument()
  })

  it('limits each card to statuses allowed for its record type', () => {
    const typedStatusField = {
      ...fields[1],
      config: {
        options: [
          { label: '待开始', value: 'SCHEDULED' },
          { label: '已结束', value: 'FINISHED' },
          { label: '待处理', value: 'TODO' },
          { label: '已完成', value: 'DONE' },
        ],
        optionsByRecordType: {
          MEETING: ['SCHEDULED', 'FINISHED'],
          ACTION: ['TODO', 'DONE'],
        },
      },
    }
    const typedRecords = [
      {
        ...records[0],
        id: 'meeting-1',
        values: { title: '研发周会', recordType: 'MEETING', status: 'SCHEDULED' },
      },
      {
        ...records[0],
        id: 'action-1',
        values: { title: '整理纪要', recordType: 'ACTION', status: 'TODO' },
      },
    ]

    render(
      <KanbanView
        fields={[fields[0], typedStatusField]}
        records={typedRecords}
        groupFieldKey="status"
        onRecordUpdate={vi.fn()}
      />
    )

    const meetingStatus = screen.getByRole('combobox', { name: '移动“研发周会”' })
    const actionStatus = screen.getByRole('combobox', { name: '移动“整理纪要”' })
    expect(within(meetingStatus).getByRole('option', { name: '已结束' })).toBeInTheDocument()
    expect(within(meetingStatus).queryByRole('option', { name: '待处理' })).not.toBeInTheDocument()
    expect(within(actionStatus).getByRole('option', { name: '已完成' })).toBeInTheDocument()
    expect(within(actionStatus).queryByRole('option', { name: '待开始' })).not.toBeInTheDocument()
  })

  it('ignores a drag target that is not allowed for the record type', () => {
    const onRecordUpdate = vi.fn()
    const typedStatusField = {
      ...fields[1],
      config: {
        options: [
          { label: '待开始', value: 'SCHEDULED' },
          { label: '已结束', value: 'FINISHED' },
          { label: '待处理', value: 'TODO' },
        ],
        optionsByRecordType: {
          MEETING: ['SCHEDULED', 'FINISHED'],
          ACTION: ['TODO'],
        },
      },
    }
    const meeting = {
      ...records[0],
      id: 'meeting-1',
      values: { title: '研发周会', recordType: 'MEETING', status: 'SCHEDULED' },
    }

    render(
      <KanbanView
        fields={[fields[0], typedStatusField]}
        records={[meeting]}
        groupFieldKey="status"
        onRecordUpdate={onRecordUpdate}
      />
    )

    act(() =>
      dndHarness.dragEnd?.({
        active: { id: 'record:meeting-1' },
        over: { id: 'column:TODO' },
      })
    )

    expect(onRecordUpdate).not.toHaveBeenCalled()
  })

  it('does not offer a globally read-only select field as a kanban grouping field', () => {
    const priorityField = {
      ...fields[1],
      id: 'field-priority',
      key: 'priority',
      name: '优先级',
      config: {
        options: [
          { label: '普通', value: 'NORMAL' },
          { label: '紧急', value: 'URGENT' },
        ],
      },
    }
    const readOnlyStatusField = {
      ...fields[1],
      config: { ...fields[1].config, readOnly: true },
    }

    render(
      <KanbanView
        fields={[fields[0], readOnlyStatusField, priorityField]}
        records={[{ ...records[0], values: { ...records[0].values, priority: 'NORMAL' } }]}
        groupFieldKey="status"
        onRecordUpdate={vi.fn()}
      />
    )

    const groupingField = screen.getByRole('combobox', { name: '分组字段' })
    expect(groupingField).toHaveValue('priority')
    expect(within(groupingField).queryByRole('option', { name: '状态' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '普通 1' })).toBeInTheDocument()
  })

  it('prevents records with a read-only record type from moving', async () => {
    const onRecordUpdate = vi.fn()
    const typedStatusField = {
      ...fields[1],
      config: {
        ...fields[1].config,
        readOnlyRecordTypes: ['MEETING'],
      },
    }
    const meeting = {
      ...records[0],
      id: 'meeting-1',
      values: { title: '研发周会', recordType: 'MEETING', status: 'TODO' },
    }

    render(
      <KanbanView
        fields={[fields[0], typedStatusField]}
        records={[meeting]}
        groupFieldKey="status"
        onRecordUpdate={onRecordUpdate}
      />
    )

    expect(screen.getByRole('combobox', { name: '移动“研发周会”' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '拖动“研发周会”' })).toBeDisabled()

    act(() =>
      dndHarness.dragEnd?.({
        active: { id: 'record:meeting-1' },
        over: { id: 'column:DOING' },
      })
    )

    expect(onRecordUpdate).not.toHaveBeenCalled()
  })

  it('keeps a record disabled while its move request is pending', async () => {
    let resolveUpdate: (() => void) | undefined
    const onRecordUpdate = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve
        })
    )
    const user = userEvent.setup()

    render(
      <KanbanView
        fields={fields}
        records={records}
        groupFieldKey="status"
        onRecordUpdate={onRecordUpdate}
      />
    )

    const movementSelect = screen.getByRole('combobox', { name: '移动“完成评审”' })
    await user.selectOptions(movementSelect, 'DOING')

    expect(movementSelect).toBeDisabled()
    expect(screen.getByRole('button', { name: '拖动“完成评审”' })).toBeDisabled()

    act(() =>
      dndHarness.dragEnd?.({
        active: { id: 'record:record-1' },
        over: { id: 'column:DOING' },
      })
    )
    expect(onRecordUpdate).toHaveBeenCalledTimes(1)

    await act(async () => resolveUpdate?.())
    expect(movementSelect).toBeEnabled()
  })

  it('accepts only one move when duplicate drag events arrive before rendering', () => {
    const onRecordUpdate = vi.fn().mockImplementation(() => new Promise<void>(() => undefined))

    render(
      <KanbanView
        fields={fields}
        records={records}
        groupFieldKey="status"
        onRecordUpdate={onRecordUpdate}
      />
    )

    act(() => {
      dndHarness.dragEnd?.({
        active: { id: 'record:record-1' },
        over: { id: 'column:DOING' },
      })
      dndHarness.dragEnd?.({
        active: { id: 'record:record-1' },
        over: { id: 'column:DOING' },
      })
    })

    expect(onRecordUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('CalendarView', () => {
  it('renders records against the selected date field and opens the source record', async () => {
    const onOpenRecord = vi.fn()
    const user = userEvent.setup()

    render(
      <CalendarView
        fields={fields}
        records={records}
        dateFieldKey="dueAt"
        initialDate="2026-07-01"
        onOpenRecord={onOpenRecord}
      />
    )

    expect(screen.getByRole('heading', { name: '2026年7月' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '星期一' })).toBeInTheDocument()
    expect(screen.getByText('完成评审')).toBeInTheDocument()
    await user.click(screen.getByText('完成评审'))
    expect(onOpenRecord).toHaveBeenCalledWith(records[0])
  })

  it('asks for a date field when the table has none', () => {
    render(
      <CalendarView
        fields={fields.filter((field) => field.type !== 'DATETIME')}
        records={records}
      />
    )

    expect(screen.getByText('请先添加日期字段，再创建日历视图。')).toBeInTheDocument()
  })
})

describe('FormView', () => {
  it('builds a custom-record form from fields and normalizes submitted values', async () => {
    const onCreateRecord = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<FormView tableSource="CUSTOM" fields={fields} onCreateRecord={onCreateRecord} />)

    await user.type(screen.getByLabelText('事项'), '准备周会')
    await user.selectOptions(screen.getByLabelText('状态'), 'DOING')
    fireEvent.change(screen.getByLabelText('截止日期'), {
      target: { value: '2026-07-24T10:30' },
    })
    await user.click(screen.getByLabelText('已确认'))
    await user.click(screen.getByRole('button', { name: '提交记录' }))

    expect(onCreateRecord).toHaveBeenCalledWith({
      values: {
        title: '准备周会',
        status: 'DOING',
        dueAt: '2026-07-24T10:30',
        done: true,
      },
    })
  })

  it('does not create mirror records for a system preset table', () => {
    render(<FormView tableSource="WORK_TASKS" fields={fields} onCreateRecord={vi.fn()} />)

    expect(screen.getByText('预置业务表不能通过表单新增镜像记录。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '提交记录' })).not.toBeInTheDocument()
  })

  it('keeps the draft visible and reports a rejected record save', async () => {
    const onCreateRecord = vi.fn().mockRejectedValue(new Error('本地服务不可用'))
    const user = userEvent.setup()

    render(<FormView tableSource="CUSTOM" fields={fields} onCreateRecord={onCreateRecord} />)

    await user.type(screen.getByLabelText('事项'), '保留这条草稿')
    await user.click(screen.getByRole('button', { name: '提交记录' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('本地服务不可用')
    expect(screen.getByLabelText('事项')).toHaveValue('保留这条草稿')
  })

  it('normalizes comma and line separated attachment paths into an array', async () => {
    const onCreateRecord = vi.fn().mockResolvedValue(undefined)
    const attachmentField = {
      id: 'field-attachments',
      tableId: 'table-1',
      name: '附件',
      key: 'attachments',
      type: 'ATTACHMENT' as const,
      config: {},
      isPrimary: false,
      isRequired: false,
      sequence: 4,
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
    }
    const user = userEvent.setup()

    render(
      <FormView
        tableSource="CUSTOM"
        fields={[...fields, attachmentField]}
        onCreateRecord={onCreateRecord}
      />
    )

    await user.type(screen.getByLabelText('事项'), '归档材料')
    fireEvent.change(screen.getByLabelText('附件'), {
      target: { value: '/docs/spec.pdf, /docs/design.png\n/docs/notes.docx' },
    })
    await user.click(screen.getByRole('button', { name: '提交记录' }))

    expect(onCreateRecord).toHaveBeenCalledWith({
      values: expect.objectContaining({
        attachments: ['/docs/spec.pdf', '/docs/design.png', '/docs/notes.docx'],
      }),
    })
  })
})

describe('ViewManager', () => {
  const views = [
    {
      id: 'view-grid',
      tableId: 'table-1',
      name: '全部记录',
      type: 'GRID' as const,
      config: {},
      isDefault: true,
      sequence: 0,
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
    },
  ]

  it('adds, renames, saves and deletes persisted views', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onRename = vi.fn().mockResolvedValue(undefined)
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <ViewManager
        views={views}
        activeViewId="view-grid"
        onSelect={vi.fn()}
        onCreate={onCreate}
        onRename={onRename}
        onSave={onSave}
        onDelete={onDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: '新增视图' }))
    await user.type(screen.getByLabelText('视图名称'), '状态看板')
    await user.selectOptions(screen.getByLabelText('视图类型'), 'KANBAN')
    await user.click(screen.getByRole('button', { name: '确认新增' }))
    expect(onCreate).toHaveBeenCalledWith({ name: '状态看板', type: 'KANBAN', config: {} })

    await user.click(screen.getByRole('button', { name: '视图设置' }))
    await user.clear(screen.getByLabelText('重命名视图'))
    await user.type(screen.getByLabelText('重命名视图'), '研发事项')
    await user.click(screen.getByRole('button', { name: '保存名称' }))
    await user.click(screen.getByRole('button', { name: '保存当前配置' }))
    await user.click(screen.getByRole('button', { name: '删除当前视图' }))

    expect(onRename).toHaveBeenCalledWith('view-grid', '研发事项')
    expect(onSave).toHaveBeenCalledWith('view-grid')
    expect(onDelete).toHaveBeenCalledWith('view-grid')
  })
})
