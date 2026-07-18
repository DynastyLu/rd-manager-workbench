import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { GridView } from '../components/GridView'
import type { BaseRecord, DataField, DataView } from '../types'

const fields: DataField[] = [
  { id: 'field-name', tableId: 'table-1', key: 'name', name: '项目名称', type: 'TEXT', config: {}, isPrimary: true, isRequired: true, sequence: 0, createdAt: '', updatedAt: '' },
  { id: 'field-budget', tableId: 'table-1', key: 'budget', name: '预算', type: 'NUMBER', config: {}, isPrimary: false, isRequired: false, sequence: 1, createdAt: '', updatedAt: '' },
  { id: 'field-active', tableId: 'table-1', key: 'active', name: '启用', type: 'CHECKBOX', config: {}, isPrimary: false, isRequired: false, sequence: 2, createdAt: '', updatedAt: '' },
  { id: 'field-files', tableId: 'table-1', key: 'files', name: '附件', type: 'ATTACHMENT', config: {}, isPrimary: false, isRequired: false, sequence: 3, createdAt: '', updatedAt: '' },
]

const view: DataView = { id: 'view-1', tableId: 'table-1', name: '表格', type: 'GRID', config: {}, isDefault: true, sequence: 0, createdAt: '', updatedAt: '' }
const records: BaseRecord[] = [
  { id: 'record-1', values: { name: '北斗项目', budget: 120, active: true, files: ['file-1'] }, sourceType: 'PROJECT', sourceId: 'project-1', sourcePath: '/spaces/projects/project-1', createdAt: '', updatedAt: '' },
]

describe('GridView', () => {
  it('renders dynamic fields and opens the original business object', () => {
    render(
      <MemoryRouter>
        <GridView fields={fields} records={records} view={view} onRecordChange={vi.fn()} onViewChange={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('columnheader', { name: '项目名称' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '预算' })).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开：北斗项目' })).toHaveAttribute('href', '/spaces/projects/project-1')
  })

  it('edits a text cell inline and returns only the changed field', async () => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={fields} records={records} view={view} onRecordChange={onRecordChange} onViewChange={vi.fn()} />
      </MemoryRouter>,
    )

    await user.dblClick(screen.getByText('北斗项目'))
    const editor = screen.getByLabelText('编辑项目名称')
    await user.clear(editor)
    await user.type(editor, '北斗二期')
    fireEvent.blur(editor)

    await waitFor(() => expect(onRecordChange).toHaveBeenCalledWith('record-1', { name: '北斗二期' }))
  })

  it('persists search, sorting, filtering and grouping in the active view config', async () => {
    const onViewChange = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={fields} records={records} view={view} onRecordChange={vi.fn()} onViewChange={onViewChange} />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('搜索当前表'), '北斗')
    await user.selectOptions(screen.getByLabelText('排序字段'), 'budget')
    await user.selectOptions(screen.getByLabelText('筛选字段'), 'active')
    await user.selectOptions(screen.getByLabelText('分组字段'), 'active')

    await waitFor(() => expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({
      query: '北斗',
      sortField: 'budget',
      filterField: 'active',
      groupField: 'active',
    })))
  })

  it('normalizes attachment input to an array before saving', async () => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={fields} records={records} view={view} onRecordChange={onRecordChange} onViewChange={vi.fn()} />
      </MemoryRouter>,
    )

    await user.dblClick(screen.getByText('file-1'))
    const editor = screen.getByLabelText('编辑附件')
    await user.clear(editor)
    await user.type(editor, 'file-2, file-3\nfile-4')
    fireEvent.blur(editor)

    await waitFor(() => expect(onRecordChange).toHaveBeenCalledWith('record-1', {
      files: ['file-2', 'file-3', 'file-4'],
    }))
  })

  it('keeps attachment editing multiline until blur instead of submitting a string on Enter', async () => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={fields} records={records} view={view} onRecordChange={onRecordChange} onViewChange={vi.fn()} />
      </MemoryRouter>,
    )

    await user.dblClick(screen.getByText('file-1'))
    const editor = screen.getByLabelText('编辑附件')
    await user.clear(editor)
    await user.type(editor, 'file-2')
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(onRecordChange).not.toHaveBeenCalled()
    fireEvent.blur(editor)
    await waitFor(() => expect(onRecordChange).toHaveBeenCalledWith('record-1', {
      files: ['file-2'],
    }))
  })

  it('does not open the record drawer when the user is editing a cell', async () => {
    const onRecordSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={fields} records={records} view={view} onRecordChange={vi.fn()} onViewChange={vi.fn()} onRecordSelect={onRecordSelect} />
      </MemoryRouter>,
    )

    await user.dblClick(screen.getByText('北斗项目'))

    expect(screen.getByLabelText('编辑项目名称')).toBeInTheDocument()
    expect(onRecordSelect).not.toHaveBeenCalled()
  })

  it('persists a user-defined column order while keeping the primary field first', async () => {
    const onViewChange = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={fields} records={records} view={view} onRecordChange={vi.fn()} onViewChange={onViewChange} />
      </MemoryRouter>,
    )

    await user.click(screen.getByText('显示字段'))
    await user.click(screen.getByRole('button', { name: '前移：启用' }))

    expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fieldOrder: ['field-name', 'field-active', 'field-budget', 'field-files'],
    }))
  })

  it('renders grouped child records instead of replacing them with group headers', async () => {
    const groupedView = { ...view, config: { groupField: 'active' } }
    const groupedRecords: BaseRecord[] = [
      records[0]!,
      { ...records[0]!, id: 'record-2', values: { ...records[0]!.values, name: '火星项目' } },
    ]
    render(
      <MemoryRouter>
        <GridView fields={fields} records={groupedRecords} view={groupedView} onRecordChange={vi.fn()} onViewChange={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByText('北斗项目')).toBeInTheDocument()
    expect(screen.getByText('火星项目')).toBeInTheDocument()
    expect(screen.getByText('2 条记录')).toBeInTheDocument()
  })

  it('keeps configured system fields read-only for matching record types', async () => {
    const onRecordChange = vi.fn()
    const readOnlyFields: DataField[] = [
      fields[0]!,
      { ...fields[1]!, config: { readOnlyRecordTypes: ['PROJECT'] } },
    ]
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={readOnlyFields} records={[{ ...records[0]!, values: { ...records[0]!.values, recordType: 'PROJECT' } }]} view={view} onRecordChange={onRecordChange} onViewChange={vi.fn()} />
      </MemoryRouter>,
    )

    await user.dblClick(screen.getByText('120'))
    expect(screen.queryByLabelText('编辑预算')).not.toBeInTheDocument()
    expect(onRecordChange).not.toHaveBeenCalled()
  })

  it('submits a single relation as a string unless the field enables multiple values', async () => {
    const onRecordChange = vi.fn().mockResolvedValue(undefined)
    const relationField: DataField = { ...fields[3]!, id: 'field-relation', key: 'relation', name: '关联项目', type: 'RELATION', config: {} }
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView fields={[fields[0]!, relationField]} records={[{ ...records[0]!, values: { name: '北斗项目', relation: 'project-1' } }]} view={view} onRecordChange={onRecordChange} onViewChange={vi.fn()} />
      </MemoryRouter>,
    )

    await user.dblClick(screen.getByText('project-1'))
    const editor = screen.getByLabelText('编辑关联项目')
    await user.clear(editor)
    await user.type(editor, 'project-2')
    fireEvent.blur(editor)

    await waitFor(() => expect(onRecordChange).toHaveBeenCalledWith('record-1', { relation: 'project-2' }))
  })
})
