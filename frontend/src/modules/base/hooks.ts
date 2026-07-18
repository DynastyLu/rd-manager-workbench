import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBaseField,
  createBaseRecord,
  createBaseTable,
  listBaseRecords,
  listBaseWorkspaces,
  updateBaseRecord,
  updateBaseView,
} from './api'
import type { BaseRecordQuery, CreateDataFieldInput, DataViewConfig } from './types'

export const baseKeys = {
  workspaces: ['base', 'workspaces'] as const,
  records: (tableId: string, query: BaseRecordQuery) => ['base', 'records', tableId, query] as const,
}

export function useBaseWorkspaces() {
  return useQuery({ queryKey: baseKeys.workspaces, queryFn: listBaseWorkspaces })
}

export function useBaseRecords(tableId: string | null, query: BaseRecordQuery) {
  return useQuery({
    queryKey: baseKeys.records(tableId ?? '', query),
    queryFn: () => listBaseRecords(tableId!, query),
    enabled: Boolean(tableId),
  })
}

export function useCreateBaseTable() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) =>
      createBaseTable(workspaceId, { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
  })
}

export function useCreateBaseField() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, input }: { tableId: string; input: CreateDataFieldInput }) =>
      createBaseField(tableId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
  })
}

export function useCreateBaseRecord() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, values }: { tableId: string; values: Record<string, unknown> }) =>
      createBaseRecord(tableId, values),
    onSuccess: (_, input) => client.invalidateQueries({ queryKey: ['base', 'records', input.tableId] }),
  })
}

export function useUpdateBaseRecord() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, recordId, values }: { tableId: string; recordId: string; values: Record<string, unknown> }) =>
      updateBaseRecord(tableId, recordId, values),
    onSuccess: (_, input) => client.invalidateQueries({ queryKey: ['base', 'records', input.tableId] }),
  })
}

export function useUpdateBaseView() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: DataViewConfig }) => updateBaseView(id, { config }),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
  })
}
