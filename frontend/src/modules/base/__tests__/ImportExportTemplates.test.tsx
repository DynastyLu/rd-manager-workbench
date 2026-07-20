import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportDialog } from '../components/ImportDialog'
import { uniqueImportFieldKey } from '../components/import-utils'
import { TemplateCenter } from '../components/TemplateCenter'

const api = vi.hoisted(() => ({
  listBaseTemplates: vi.fn(),
  getBaseTemplate: vi.fn(),
  instantiateBaseTemplate: vi.fn(),
  uploadBaseImport: vi.fn(),
  previewBaseImport: vi.fn(),
  commitBaseImport: vi.fn(),
  downloadBaseImportErrors: vi.fn(),
  inspectBaseImport: vi.fn(),
}))
vi.mock('../api', () => api)

const table = {
  id: 'table-1', workspaceId: 'workspace-1', name: '清单', description: null, source: 'CUSTOM' as const, icon: null, sequence: 0,
  fields: [{ id: 'title', tableId: 'table-1', key: 'title', name: '标题', type: 'TEXT' as const, config: {}, isPrimary: true, isRequired: true, sequence: 0, createdAt: '', updatedAt: '' }],
  views: [], createdAt: '', updatedAt: '',
}

describe('base import, export and templates UI', () => {
  it('generates a usable unique key for newly mapped fields', () => {
    expect(uniqueImportFieldKey(new Set(['import_1', 'import_1_2']), 'import_1')).toBe('import_1_3')
  })
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.listBaseTemplates.mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({
      key: `template-${index}`, version: 1, name: `模板 ${index + 1}`, description: '真实业务模板', icon: 'B', category: 'RESEARCH', fieldCount: 12, viewTypes: ['GRID', 'KANBAN'], primaryFields: ['标题'],
    })))
    api.getBaseTemplate.mockResolvedValue({ key: 'template-0', version: 1, name: '模板 1', description: '真实业务模板', icon: 'B', category: 'RESEARCH', fields: [], views: [] })
  })

  it('lists five templates, previews one and instantiates it once', async () => {
    api.instantiateBaseTemplate.mockResolvedValue({ ...table, id: 'created', name: '自定义模板表' })
    const complete = vi.fn()
    const user = userEvent.setup()
    render(<TemplateCenter visible workspaceId="workspace-1" onClose={() => undefined} onCreated={complete} />)
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(await screen.findAllByText(/模板 \d/)).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: /模板 1/ }))
    await user.clear(await screen.findByLabelText('新表名称'))
    await user.type(screen.getByLabelText('新表名称'), '自定义模板表')
    await user.click(screen.getByRole('button', { name: '创建此模板' }))
    expect(api.instantiateBaseTemplate).toHaveBeenCalledWith('workspace-1', 'template-0', { name: '自定义模板表' })
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'created' }))
  })

  it('invalidates preview when mapping changes and commits the previewed session', async () => {
    api.uploadBaseImport.mockResolvedValue({
      session: { id: 'session-1', tableId: 'table-1', originalName: 'items.csv', format: 'CSV', selectedSheet: 'CSV', status: 'UPLOADED', totalRows: 0, validRows: 0, errorRows: 0, importedRows: 0, hasErrors: false, expiresAt: '' },
      preview: { sheetNames: ['CSV'], selectedSheet: 'CSV', columns: ['标题'], inferredTypes: { 标题: 'TEXT' }, rows: [{ rowNumber: 2, values: { 标题: '演示' } }] },
    })
    api.previewBaseImport.mockResolvedValue({
      session: { id: 'session-1', tableId: 'table-1', originalName: 'items.csv', format: 'CSV', selectedSheet: 'CSV', status: 'PREVIEWED', totalRows: 1, validRows: 1, errorRows: 0, importedRows: 0, hasErrors: false, expiresAt: '' },
      preview: { sheetNames: ['CSV'], selectedSheet: 'CSV', columns: ['标题'], inferredTypes: { 标题: 'TEXT' }, rows: [] }, errors: [],
    })
    api.commitBaseImport.mockResolvedValue({ id: 'session-1', status: 'COMPLETED', totalRows: 1, validRows: 1, errorRows: 0, importedRows: 1 })
    const user = userEvent.setup()
    render(<ImportDialog visible table={table} onClose={() => undefined} onCompleted={() => undefined} />)
    const input = screen.getByLabelText('选择导入文件')
    fireEvent.change(input, { target: { files: [new File(['标题\n演示'], 'items.csv', { type: 'text/csv' })] } })
    await user.click(screen.getByRole('button', { name: '上传并继续' }))
    await user.click(await screen.findByRole('button', { name: '全量预检' }))
    expect(await screen.findByText('有效 1 行')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认导入' }))
    await waitFor(() => expect(api.commitBaseImport).toHaveBeenCalledWith('session-1'))
    expect(await screen.findByText('成功导入 1 行')).toBeInTheDocument()
  })

  it('re-inspects a non-first XLSX sheet before building its mapping', async () => {
    api.uploadBaseImport.mockResolvedValue({
      session: { id: 'xlsx-session', tableId: 'table-1', originalName: 'items.xlsx', format: 'XLSX', selectedSheet: '第一张', status: 'UPLOADED', totalRows: 0, validRows: 0, errorRows: 0, importedRows: 0, hasErrors: false, expiresAt: '' },
      preview: { sheetNames: ['第一张', '第二张'], selectedSheet: '第一张', columns: ['旧列'], inferredTypes: { 旧列: 'TEXT' }, rows: [] },
    })
    api.inspectBaseImport.mockResolvedValue({ sheetNames: ['第一张', '第二张'], selectedSheet: '第二张', columns: ['标题'], inferredTypes: { 标题: 'TEXT' }, rows: [{ rowNumber: 2, values: { 标题: '第二张数据' } }] })
    const user = userEvent.setup()
    render(<ImportDialog visible table={table} onClose={() => undefined} onCompleted={() => undefined} />)
    fireEvent.change(screen.getByLabelText('选择导入文件'), { target: { files: [new File(['xlsx'], 'items.xlsx')] } })
    await user.click(screen.getByRole('button', { name: '上传并继续' }))
    await user.selectOptions(await screen.findByLabelText('工作表'), '第二张')
    await user.click(screen.getByRole('button', { name: '继续字段映射' }))
    expect(api.inspectBaseImport).toHaveBeenCalledWith('xlsx-session', '第二张')
    expect(await screen.findByLabelText('标题 映射')).toBeInTheDocument()
    expect(screen.queryByLabelText('旧列 映射')).not.toBeInTheDocument()
  })
})
