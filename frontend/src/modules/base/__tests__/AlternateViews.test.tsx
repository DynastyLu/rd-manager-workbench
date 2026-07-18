import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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
