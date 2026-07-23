import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'

import { FieldManager } from '../components/FieldManager'
import { FormulaEditor } from '../components/FormulaEditor'
import type { DataField, DataTable, FormulaPreviewResult } from '../types'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

const result = (value: string): FormulaPreviewResult => ({
  astVersion: 1,
  ast: { kind: 'literal', value },
  dependencies: [],
  dependencyFields: [],
  value,
})

const field = (
  id: string,
  name: string,
  type: DataField['type'],
  config: Record<string, unknown> = {}
): DataField => ({
  id,
  tableId: 'table-1',
  key: id,
  name,
  type,
  config,
  isPrimary: id === 'name',
  isRequired: false,
  sequence: 0,
  createdAt: '',
  updatedAt: '',
})

const fields = [
  field('name', '名称', 'TEXT'),
  field('current', '当前公式', 'FORMULA', { expression: '{name}', dependencies: ['name'] }),
  field('direct', '直接依赖', 'FORMULA', { expression: '{current}', dependencies: ['current'] }),
  field('transitive', '传递依赖', 'FORMULA', { expression: '{direct}', dependencies: ['direct'] }),
  field('unrelated', '无关公式', 'FORMULA', { expression: '1', dependencies: [] }),
]

const table: DataTable = {
  id: 'table-1',
  workspaceId: 'workspace-1',
  name: '测试表',
  description: null,
  source: 'CUSTOM',
  icon: null,
  sequence: 0,
  fields,
  views: [],
  createdAt: '',
  updatedAt: '',
}

describe('computed field interaction hardening', () => {
  it.each(['resolve', 'reject'] as const)(
    'ignores a stale preview %s without clearing the active preview',
    async (settlement) => {
      const first = deferred<FormulaPreviewResult>()
      const second = deferred<FormulaPreviewResult>()
      const preview = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const user = userEvent.setup()
      const props = { tableId: 'table-1', fields, onChange: vi.fn(), preview }
      const { rerender } = render(
        <FormulaEditor {...props} identity="field-a" recordId="record-a" value="{name}" />
      )

      await user.click(screen.getByRole('button', { name: '预览公式' }))
      rerender(
        <FormulaEditor {...props} identity="field-b" recordId="record-b" value="{unrelated}" />
      )
      await user.type(screen.getByRole('textbox', { name: '公式表达式' }), ' + 1')
      await user.click(screen.getByRole('button', { name: '预览公式' }))
      expect(screen.getByRole('button', { name: '正在预览' })).toBeInTheDocument()

      await act(async () => {
        if (settlement === 'resolve') first.resolve(result('旧结果'))
        else first.reject(new Error('旧错误'))
        await first.promise.catch(() => undefined)
      })
      expect(screen.getByRole('button', { name: '正在预览' })).toBeInTheDocument()
      expect(screen.queryByText('结果：旧结果')).not.toBeInTheDocument()
      expect(screen.queryByText('旧错误')).not.toBeInTheDocument()

      await act(async () => {
        second.resolve(result('新结果'))
        await second.promise
      })
      expect(await screen.findByText('结果：新结果')).toBeInTheDocument()
    }
  )

  it('invalidates a pending preview when unmounted', async () => {
    const pending = deferred<FormulaPreviewResult>()
    const preview = vi.fn().mockReturnValue(pending.promise)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    const mounted = render(
      <FormulaEditor
        tableId="table-1"
        fields={fields}
        value="{name}"
        onChange={vi.fn()}
        preview={preview}
      />
    )
    await user.click(screen.getByRole('button', { name: '预览公式' }))
    mounted.unmount()
    await act(async () => {
      pending.resolve(result('卸载后结果'))
      await pending.promise
    })
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('accepts preview results under React StrictMode effect replay', async () => {
    const preview = vi.fn().mockResolvedValue(result('严格模式结果'))
    const user = userEvent.setup()
    render(
      <StrictMode>
        <FormulaEditor
          tableId="table-1"
          fields={fields}
          value="{name}"
          onChange={vi.fn()}
          preview={preview}
        />
      </StrictMode>
    )
    await user.click(screen.getByRole('button', { name: '预览公式' }))
    expect(await screen.findByText('结果：严格模式结果')).toBeInTheDocument()
  })

  it('excludes self and direct or transitive dependents while editing a formula', async () => {
    const user = userEvent.setup()
    render(<FieldManager table={table} visible onClose={vi.fn()} onCreateField={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '编辑字段：当前公式' }))
    const editDialog = screen.getByRole('dialog', { name: '编辑字段' })
    expect(within(editDialog).getByRole('button', { name: '插入字段：名称' })).toBeInTheDocument()
    expect(
      within(editDialog).getByRole('button', { name: '插入字段：无关公式' })
    ).toBeInTheDocument()
    expect(
      within(editDialog).queryByRole('button', { name: '插入字段：当前公式' })
    ).not.toBeInTheDocument()
    expect(
      within(editDialog).queryByRole('button', { name: '插入字段：直接依赖' })
    ).not.toBeInTheDocument()
    expect(
      within(editDialog).queryByRole('button', { name: '插入字段：传递依赖' })
    ).not.toBeInTheDocument()
  })

  it('offers all existing legal fields when creating a new formula', async () => {
    const user = userEvent.setup()
    render(<FieldManager table={table} visible onClose={vi.fn()} onCreateField={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await selectSemiOption(screen.getByLabelText('字段类型'), 'FORMULA')
    const dialog = screen.getByRole('dialog', { name: '新增字段' })
    for (const name of ['名称', '当前公式', '直接依赖', '传递依赖', '无关公式']) {
      expect(within(dialog).getByRole('button', { name: `插入字段：${name}` })).toBeInTheDocument()
    }
  })

  it('keeps a create draft open when persistence rejects', async () => {
    const onCreateField = vi.fn().mockRejectedValue(new Error('create failed'))
    const user = userEvent.setup()
    render(<FieldManager table={table} visible onClose={vi.fn()} onCreateField={onCreateField} />)

    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await user.type(screen.getByLabelText('字段名称'), '失败公式')
    await selectSemiOption(screen.getByLabelText('字段类型'), 'FORMULA')
    fireEvent.change(screen.getByRole('textbox', { name: '公式表达式' }), {
      target: { value: '{name}' },
    })
    await user.click(screen.getByRole('button', { name: '保存字段' }))
    expect(await screen.findByRole('dialog', { name: '新增字段' })).toBeInTheDocument()
    expect(screen.getByLabelText('字段名称')).toHaveValue('失败公式')
    expect(screen.getByRole('textbox', { name: '公式表达式' })).toHaveValue('{name}')
  })

  it('keeps an edit draft open when persistence rejects', async () => {
    const onUpdateField = vi.fn().mockRejectedValue(new Error('update failed'))
    const user = userEvent.setup()
    render(
      <FieldManager
        table={table}
        visible
        onClose={vi.fn()}
        onCreateField={vi.fn()}
        onUpdateField={onUpdateField}
      />
    )

    await user.click(screen.getByRole('button', { name: '编辑字段：当前公式' }))
    await user.clear(screen.getByLabelText('编辑字段名称'))
    await user.type(screen.getByLabelText('编辑字段名称'), '修改后公式')
    await user.click(screen.getByRole('button', { name: '保存字段修改' }))
    expect(await screen.findByRole('dialog', { name: '编辑字段' })).toBeInTheDocument()
    expect(screen.getByLabelText('编辑字段名称')).toHaveValue('修改后公式')
  })
})
