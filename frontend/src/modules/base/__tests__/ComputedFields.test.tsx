import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/http'
import { getSemiOptionValues, isSemiOptionDisabled, selectSemiOption } from '@/test-utils/selectSemiOption'
import { FieldManager } from '../components/FieldManager'
import { FormView } from '../components/FormView'
import { FormulaEditor } from '../components/FormulaEditor'
import { GridView } from '../components/GridView'
import { KanbanView } from '../components/KanbanView'
import { RelationPicker } from '../components/RelationPicker'
import type { BaseRecord, DataField, DataTable, DataView } from '../types'

const api = vi.hoisted(() => ({
  listBaseRecords: vi.fn(),
  previewBaseFormula: vi.fn(),
}))

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  listBaseRecords: api.listBaseRecords,
  previewBaseFormula: api.previewBaseFormula,
}))

const field = (
  input: Partial<DataField> & Pick<DataField, 'id' | 'key' | 'name' | 'type'>
): DataField => ({
  tableId: 'table-candidates',
  config: {},
  isPrimary: false,
  isRequired: false,
  sequence: 0,
  createdAt: '',
  updatedAt: '',
  ...input,
})

const positionTable: DataTable = {
  id: 'table-positions',
  workspaceId: 'workspace-1',
  name: '岗位',
  description: null,
  source: 'CUSTOM',
  icon: null,
  sequence: 1,
  fields: [
    field({
      id: 'field-position-title',
      tableId: 'table-positions',
      key: 'title',
      name: '岗位名称',
      type: 'TEXT',
      isPrimary: true,
    }),
    field({
      id: 'field-position-score',
      tableId: 'table-positions',
      key: 'score',
      name: '评分',
      type: 'NUMBER',
    }),
    field({
      id: 'field-position-formula',
      tableId: 'table-positions',
      key: 'computed',
      name: '计算结果',
      type: 'FORMULA',
    }),
  ],
  views: [],
  createdAt: '',
  updatedAt: '',
}

const relationField = field({
  id: 'field-position',
  key: 'position',
  name: '岗位',
  type: 'RELATION',
  sequence: 1,
  config: {
    targetTableId: positionTable.id,
    multiple: false,
    relationMode: 'ONE_WAY',
  },
})

const candidateTable: DataTable = {
  id: 'table-candidates',
  workspaceId: 'workspace-1',
  name: '候选人',
  description: null,
  source: 'CUSTOM',
  icon: null,
  sequence: 0,
  fields: [
    field({ id: 'field-name', key: 'name', name: '候选人', type: 'TEXT', isPrimary: true }),
    relationField,
  ],
  views: [],
  createdAt: '',
  updatedAt: '',
}

const systemProjectTable: DataTable = {
  ...positionTable,
  id: 'table-projects',
  name: '项目总表',
  source: 'PROJECTS',
  sequence: 2,
  fields: positionTable.fields?.map((item) => ({ ...item, tableId: 'table-projects' })),
}

const gridView: DataView = {
  id: 'view-grid',
  tableId: candidateTable.id,
  name: '表格',
  type: 'GRID',
  config: {},
  isDefault: true,
  sequence: 0,
  createdAt: '',
  updatedAt: '',
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('computed and relational fields', () => {
  beforeEach(() => {
    api.listBaseRecords.mockReset()
    api.previewBaseFormula.mockReset()
    api.listBaseRecords.mockResolvedValue({
      data: [
        {
          id: 'position-1',
          values: { title: '高级前端工程师', score: 90 },
          sourceType: null,
          sourceId: null,
          sourcePath: null,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'position-2',
          values: { title: '研发经理', score: 95 },
          sourceType: null,
          sourceId: null,
          sourcePath: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
      meta: { page: 1, pageSize: 100, total: 2 },
    })
  })

  it('offers the four field types and limits lookup targets to legal fields', async () => {
    const user = userEvent.setup()
    render(
      <FieldManager
        table={candidateTable}
        tables={[candidateTable, positionTable]}
        visible
        onClose={vi.fn()}
        onCreateField={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '新增字段' }))
    const typeSelect = screen.getByLabelText('字段类型')
    await expect(getSemiOptionValues(typeSelect)).resolves.toEqual(
      expect.arrayContaining(['RELATION', 'LOOKUP', 'ROLLUP', 'FORMULA']),
    )

    await selectSemiOption(typeSelect, 'LOOKUP')
    await selectSemiOption(screen.getByLabelText('关联字段'), relationField.id)
    const targetField = screen.getByLabelText('目标字段')
    await expect(getSemiOptionValues(targetField)).resolves.toEqual(
      expect.arrayContaining(['field-position-title', 'field-position-score']),
    )
    await expect(getSemiOptionValues(targetField)).resolves.not.toContain('field-position-computed')
  })

  it('only asks for numeric rollup targets when the aggregation needs one', async () => {
    const user = userEvent.setup()
    render(
      <FieldManager
        table={candidateTable}
        tables={[candidateTable, positionTable]}
        visible
        onClose={vi.fn()}
        onCreateField={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await selectSemiOption(screen.getByLabelText('字段类型'), 'ROLLUP')
    await selectSemiOption(screen.getByLabelText('关联字段'), relationField.id)
    expect(screen.getByLabelText('汇总方式')).toHaveTextContent('计数')
    expect(screen.queryByLabelText('目标字段')).not.toBeInTheDocument()

    await selectSemiOption(screen.getByLabelText('汇总方式'), 'SUM')
    const targetField = screen.getByLabelText('目标字段')
    await expect(getSemiOptionValues(targetField)).resolves.toContain('field-position-score')
    await expect(getSemiOptionValues(targetField)).resolves.not.toContain('field-position-title')
    await expect(getSemiOptionValues(targetField)).resolves.not.toContain('field-position-computed')
  })

  it('configures bidirectional relation cardinality without exposing an inverse id', async () => {
    const onCreateField = vi.fn()
    const user = userEvent.setup()
    render(
      <FieldManager
        table={candidateTable}
        tables={[candidateTable, positionTable]}
        visible
        onClose={vi.fn()}
        onCreateField={onCreateField}
      />
    )

    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await user.type(screen.getByLabelText('字段名称'), '目标岗位')
    await selectSemiOption(screen.getByLabelText('字段类型'), 'RELATION')
    await selectSemiOption(screen.getByLabelText('目标数据表'), positionTable.id)
    await selectSemiOption(screen.getByLabelText('关联数量'), 'multiple')
    await selectSemiOption(screen.getByLabelText('关联方向'), 'TWO_WAY')
    await user.type(screen.getByLabelText('反向字段名称'), '候选人')
    await selectSemiOption(screen.getByLabelText('反向关联数量'), 'single')

    expect(screen.queryByLabelText('反向字段 ID')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存字段' }))
    expect(onCreateField).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RELATION',
        inverseFieldName: '候选人',
        inverseMultiple: false,
        config: {
          targetTableId: positionTable.id,
          multiple: true,
          relationMode: 'TWO_WAY',
        },
      })
    )
  })

  it('clears a system target when switching to two-way and prevents upgrading an existing one-way field', async () => {
    const user = userEvent.setup()
    render(
      <FieldManager
        table={candidateTable}
        tables={[candidateTable, positionTable, systemProjectTable]}
        visible
        onClose={vi.fn()}
        onCreateField={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await selectSemiOption(screen.getByLabelText('字段类型'), 'RELATION')
    await selectSemiOption(screen.getByLabelText('目标数据表'), systemProjectTable.id)
    await selectSemiOption(screen.getByLabelText('关联方向'), 'TWO_WAY')
    expect(screen.getByLabelText('目标数据表')).toHaveTextContent('请选择数据表')
    await expect(getSemiOptionValues(screen.getByLabelText('目标数据表'))).resolves.not.toContain(
      systemProjectTable.id,
    )

    await user.click(
      within(screen.getByRole('dialog', { name: '新增字段' })).getByRole('button', {
        name: 'close',
      })
    )
    await user.click(screen.getByRole('button', { name: '编辑字段：岗位' }))
    const direction = screen.getByLabelText('关联方向')
    await expect(isSemiOptionDisabled(direction, 'TWO_WAY')).resolves.toBe(true)
  })

  it('keeps the server-owned inverse field id out of relation update payloads', async () => {
    const twoWayRelation = {
      ...relationField,
      config: {
        ...relationField.config,
        relationMode: 'TWO_WAY',
        inverseFieldId: 'field-inverse',
      },
    }
    const onUpdateField = vi.fn()
    const user = userEvent.setup()
    render(
      <FieldManager
        table={{ ...candidateTable, fields: [candidateTable.fields![0]!, twoWayRelation] }}
        tables={[candidateTable, positionTable]}
        visible
        onClose={vi.fn()}
        onCreateField={vi.fn()}
        onUpdateField={onUpdateField}
      />
    )

    await user.click(screen.getByRole('button', { name: '编辑字段：岗位' }))
    expect(
      screen.getByText('反向字段由系统维护，当前字段保存时不会覆盖配对关系。')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存字段修改' }))
    expect(onUpdateField).toHaveBeenCalledWith(
      relationField.id,
      expect.objectContaining({
        config: {
          targetTableId: positionTable.id,
          multiple: false,
          relationMode: 'TWO_WAY',
        },
      })
    )
  })

  it('prevents saving an edited computed field with an incomplete configuration', async () => {
    const brokenLookup = field({
      id: 'field-broken-lookup',
      key: 'broken_lookup',
      name: '岗位名称引用',
      type: 'LOOKUP',
      config: { relationFieldId: relationField.id },
    })
    const user = userEvent.setup()
    render(
      <FieldManager
        table={{ ...candidateTable, fields: [...candidateTable.fields!, brokenLookup] }}
        tables={[candidateTable, positionTable]}
        visible
        onClose={vi.fn()}
        onCreateField={vi.fn()}
        onUpdateField={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '编辑字段：岗位名称引用' }))
    expect(screen.getByRole('button', { name: '保存字段修改' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('请补全字段配置后保存')
    await selectSemiOption(screen.getByLabelText('目标字段'), 'field-position-title')
    expect(screen.getByRole('button', { name: '保存字段修改' })).toBeEnabled()
  })

  it('searches relation labels and saves stable record ids', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Providers>
        <RelationPicker
          field={relationField}
          targetTable={positionTable}
          value="position-2"
          onChange={onChange}
        />
      </Providers>
    )

    expect(await screen.findByText('研发经理')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: '搜索岗位记录' }), '高级前端')
    expect(screen.getByText('高级前端工程师')).toBeInTheDocument()
    expect(screen.getByText('研发经理')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '选择高级前端工程师' }))

    expect(onChange).toHaveBeenCalledWith('position-1')
  })

  it('keeps a multi-relation editor open until all choices are explicitly committed', async () => {
    const multiRelation = field({
      ...relationField,
      id: 'field-positions',
      key: 'positions',
      name: '候选岗位',
      config: { ...relationField.config, multiple: true },
    })
    const onRecordChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Providers>
        <GridView
          fields={[candidateTable.fields![0]!, multiRelation]}
          tables={[candidateTable, positionTable]}
          records={[
            {
              id: 'candidate-1',
              values: { name: '张三', positions: [] },
              sourceType: null,
              sourceId: null,
              sourcePath: null,
              createdAt: '',
              updatedAt: '',
            },
          ]}
          view={gridView}
          onRecordChange={onRecordChange}
          onViewChange={vi.fn()}
        />
      </Providers>
    )

    await user.click(screen.getByText('—'))
    await user.click(await screen.findByRole('checkbox', { name: '选择高级前端工程师' }))
    await user.click(screen.getByRole('checkbox', { name: '选择研发经理' }))
    expect(onRecordChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '完成选择' }))
    expect(onRecordChange).toHaveBeenCalledWith('candidate-1', {
      positions: ['position-1', 'position-2'],
    })
  })

  it('inserts a field, deduplicates an identical pending preview and preserves a failed draft', async () => {
    let rejectPreview: ((error: Error) => void) | undefined
    api.previewBaseFormula.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPreview = reject
        })
    )
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <FormulaEditor
        tableId={candidateTable.id}
        fields={candidateTable.fields ?? []}
        value="IF("
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button', { name: '插入字段：候选人' }))
    const editor = screen.getByRole('textbox', { name: '公式表达式' })
    expect(editor).toHaveValue('IF({name}')
    await user.click(screen.getByRole('button', { name: '预览公式' }))
    await user.click(screen.getByRole('button', { name: '正在预览' }))
    expect(api.previewBaseFormula).toHaveBeenCalledTimes(1)

    rejectPreview?.(
      new ApiError('Unexpected token', 400, 'INVALID_FORMULA', {
        code: 'INVALID_FORMULA',
        position: 3,
      })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('位置 3')
    expect(editor).toHaveValue('IF({name}')
    expect(onChange).toHaveBeenLastCalledWith('IF({name}')
  })

  it('previews a formula against the selected record and renders a successful value', async () => {
    api.previewBaseFormula.mockResolvedValue({
      astVersion: 1,
      ast: { kind: 'field', fieldId: 'field-position-score' },
      dependencies: ['field-position-score'],
      dependencyFields: [{ id: 'field-position-score', name: '评分', type: 'NUMBER' }],
      value: 95,
    })
    const user = userEvent.setup()
    render(
      <FormulaEditor
        tableId={positionTable.id}
        recordId="position-2"
        fields={positionTable.fields ?? []}
        value="{score}"
        onChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '预览公式' }))
    expect(api.previewBaseFormula).toHaveBeenCalledWith(positionTable.id, {
      expression: '{score}',
      recordId: 'position-2',
    })
    expect(await screen.findByText('结果：95')).toBeInTheDocument()
  })

  it('resets the formula draft when the edited field changes', async () => {
    const user = userEvent.setup()
    const props = {
      tableId: candidateTable.id,
      fields: candidateTable.fields ?? [],
      onChange: vi.fn(),
    }
    const { rerender } = render(<FormulaEditor {...props} identity="field-a" value="{name}" />)
    expect(screen.getByRole('textbox', { name: '公式表达式' })).toHaveValue('{name}')

    await user.type(screen.getByRole('textbox', { name: '公式表达式' }), ' + 1')
    rerender(<FormulaEditor {...props} identity="field-b" value="{name}" />)
    expect(screen.getByRole('textbox', { name: '公式表达式' })).toHaveValue('{name}')
  })

  it('renders computed errors as read-only cells with a readable explanation', async () => {
    const formulaField = field({
      id: 'field-score',
      key: 'score_result',
      name: '计算结果',
      type: 'FORMULA',
    })
    const records: BaseRecord[] = [
      {
        id: 'candidate-1',
        values: { name: '张三', score_result: null },
        computedErrors: { score_result: { code: 'DIV_ZERO', message: '除数不能为零' } },
        sourceType: null,
        sourceId: null,
        sourcePath: null,
        createdAt: '',
        updatedAt: '',
      },
    ]
    const onRecordChange = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GridView
          fields={[candidateTable.fields![0]!, formulaField]}
          records={records}
          view={gridView}
          onRecordChange={onRecordChange}
          onViewChange={vi.fn()}
        />
      </MemoryRouter>
    )

    const error = screen.getByText('#DIV/0!')
    expect(error).toHaveAttribute('title', '除数不能为零')
    await user.dblClick(error)
    expect(screen.queryByLabelText('编辑计算结果')).not.toBeInTheDocument()
    expect(onRecordChange).not.toHaveBeenCalled()
  })

  it('omits computed fields from forms and kanban grouping choices', async () => {
    const computed = field({ id: 'field-result', key: 'result', name: '计算结果', type: 'FORMULA' })
    const status = field({
      id: 'field-status',
      key: 'status',
      name: '状态',
      type: 'SINGLE_SELECT',
      config: { options: [{ label: '待处理', value: 'TODO' }] },
    })
    const form = render(
      <FormView
        tableSource="CUSTOM"
        fields={[candidateTable.fields![0]!, computed]}
        onCreateRecord={vi.fn()}
      />
    )
    expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument()
    form.unmount()

    render(
      <KanbanView
        fields={[candidateTable.fields![0]!, status, computed]}
        records={[]}
        groupFieldKey="result"
        onRecordUpdate={vi.fn()}
      />
    )
    const groupingField = screen.getByRole('combobox', { name: '分组字段' })
    expect(groupingField).toHaveTextContent('状态')
    await expect(getSemiOptionValues(groupingField)).resolves.not.toContain('result')
  })
})
