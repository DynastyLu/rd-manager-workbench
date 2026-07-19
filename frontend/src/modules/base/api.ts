import { request } from '@/lib/http'
import type {
  BaseRecord,
  BaseRecordQuery,
  CreateDataFieldInput,
  DataField,
  DataTable,
  DataView,
  DataViewConfig,
  DataViewType,
  DataWorkspace,
  FormulaPreviewInput,
  FormulaPreviewResult,
  PageResult,
} from './types'

function resource(path: string, id: string) {
  return `${path}/${encodeURIComponent(id)}`
}

function queryString(params: BaseRecordQuery) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const rendered = query.toString()
  return rendered ? `?${rendered}` : ''
}

export const listBaseWorkspaces = () => request<DataWorkspace[]>('/base/workspaces')
export const createBaseWorkspace = (input: { name: string; description?: string }) =>
  request<DataWorkspace>('/base/workspaces', { method: 'POST', body: JSON.stringify(input) })
export const updateBaseWorkspace = (id: string, input: Partial<Pick<DataWorkspace, 'name' | 'description' | 'sequence'>>) =>
  request<DataWorkspace>(resource('/base/workspaces', id), { method: 'PATCH', body: JSON.stringify(input) })
export const deleteBaseWorkspace = (id: string) =>
  request<void>(resource('/base/workspaces', id), { method: 'DELETE' })

export const createBaseTable = (workspaceId: string, input: { name: string; description?: string; icon?: string }) =>
  request<DataTable>(`${resource('/base/workspaces', workspaceId)}/tables`, { method: 'POST', body: JSON.stringify(input) })
export const updateBaseTable = (id: string, input: Partial<Pick<DataTable, 'name' | 'description' | 'icon' | 'sequence'>>) =>
  request<DataTable>(resource('/base/tables', id), { method: 'PATCH', body: JSON.stringify(input) })
export const deleteBaseTable = (id: string) =>
  request<void>(resource('/base/tables', id), { method: 'DELETE' })

export const createBaseField = (tableId: string, input: CreateDataFieldInput) =>
  request<DataField>(`${resource('/base/tables', tableId)}/fields`, { method: 'POST', body: JSON.stringify(input) })
export const updateBaseField = (id: string, input: Partial<CreateDataFieldInput>) =>
  request<DataField>(resource('/base/fields', id), { method: 'PATCH', body: JSON.stringify(input) })
export const deleteBaseField = (id: string) =>
  request<void>(resource('/base/fields', id), { method: 'DELETE' })

export const previewBaseFormula = (tableId: string, input: FormulaPreviewInput) =>
  request<FormulaPreviewResult>(`${resource('/base/tables', tableId)}/formula-preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const listBaseRecords = (tableId: string, params: BaseRecordQuery = {}) =>
  request<PageResult<BaseRecord>>(`${resource('/base/tables', tableId)}/records${queryString(params)}`)
export const createBaseRecord = (tableId: string, values: Record<string, unknown>) =>
  request<BaseRecord>(`${resource('/base/tables', tableId)}/records`, { method: 'POST', body: JSON.stringify({ values }) })
export const updateBaseRecord = (tableId: string, recordId: string, values: Record<string, unknown>) =>
  request<BaseRecord>(`${resource('/base/tables', tableId)}/records/${encodeURIComponent(recordId)}`, { method: 'PATCH', body: JSON.stringify({ values }) })
export const deleteBaseRecord = (tableId: string, recordId: string) =>
  request<void>(`${resource('/base/tables', tableId)}/records/${encodeURIComponent(recordId)}`, { method: 'DELETE' })

export const createBaseView = (tableId: string, input: { name: string; type: DataViewType; config?: DataViewConfig }) =>
  request<DataView>(`${resource('/base/tables', tableId)}/views`, { method: 'POST', body: JSON.stringify(input) })
export const updateBaseView = (id: string, input: Partial<Pick<DataView, 'name' | 'type' | 'config' | 'sequence'>>) =>
  request<DataView>(resource('/base/views', id), { method: 'PATCH', body: JSON.stringify(input) })
export const deleteBaseView = (id: string) =>
  request<void>(resource('/base/views', id), { method: 'DELETE' })
