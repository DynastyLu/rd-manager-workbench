import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Toast } from '@douyinfe/semi-ui'
import {
  createBaseField,
  createBaseRecord,
  createBaseTable,
  deleteBaseField,
  listBaseRecords,
  listBaseWorkspaces,
  updateBaseField,
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
    onError: () => Toast.error('创建数据表失败。'),
  })
}

export function useCreateBaseField() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, input }: { tableId: string; input: CreateDataFieldInput }) =>
      createBaseField(tableId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
    onError: () => Toast.error('新增字段失败。'),
  })
}

export function useUpdateBaseField() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateDataFieldInput> }) => updateBaseField(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
    onError: () => Toast.error('更新字段失败。'),
  })
}

export function useDeleteBaseField() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteBaseField(id),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
    onError: () => Toast.error('删除字段失败。'),
  })
}

export function useCreateBaseRecord() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, values }: { tableId: string; values: Record<string, unknown> }) =>
      createBaseRecord(tableId, values),
    onSuccess: (_, input) => client.invalidateQueries({ queryKey: ['base', 'records', input.tableId] }),
    onError: () => Toast.error('新增记录失败。'),
  })
}

export function useUpdateBaseRecord() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, recordId, values }: { tableId: string; recordId: string; values: Record<string, unknown> }) =>
      updateBaseRecord(tableId, recordId, values),
    onSuccess: (_, input) => Promise.all([
      client.invalidateQueries({ queryKey: ['base', 'records', input.tableId] }),
      client.invalidateQueries({ queryKey: ['my-work'] }),
      client.invalidateQueries({ queryKey: ['tasks'] }),
      client.invalidateQueries({ queryKey: ['calendar'] }),
      client.invalidateQueries({ queryKey: ['projects'] }),
      client.invalidateQueries({ queryKey: ['project'] }),
      client.invalidateQueries({ queryKey: ['task'] }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
      client.invalidateQueries({ queryKey: ['reminders'] }),
      client.invalidateQueries({ queryKey: ['documents'] }),
      client.invalidateQueries({ queryKey: ['document'] }),
      client.invalidateQueries({ queryKey: ['document-versions'] }),
      client.invalidateQueries({ queryKey: ['files'] }),
      client.invalidateQueries({ queryKey: ['meetings'] }),
      client.invalidateQueries({ queryKey: ['meeting'] }),
      client.invalidateQueries({ queryKey: ['risks'] }),
      client.invalidateQueries({ queryKey: ['risk'] }),
      client.invalidateQueries({ queryKey: ['decisions'] }),
      client.invalidateQueries({ queryKey: ['decision'] }),
    ]),
    onError: () => Toast.error('更新记录失败。'),
  })
}

export function useUpdateBaseView() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: DataViewConfig }) => updateBaseView(id, { config }),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
    onError: () => Toast.error('视图配置保存失败。'),
  })
}

export function useDebouncedViewConfigSave(
  save: (viewId: string, config: DataViewConfig) => void,
  delayMs = 350,
) {
  const timers = useRef(new Map<string, number>())
  const pending = useRef(new Map<string, DataViewConfig>())
  const saveRef = useRef(save)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer)
    for (const [viewId, config] of pending.current) saveRef.current(viewId, config)
    timers.current.clear()
    pending.current.clear()
  }, [])

  return useCallback((viewId: string, config: DataViewConfig) => {
    pending.current.set(viewId, config)
    const previousTimer = timers.current.get(viewId)
    if (previousTimer !== undefined) window.clearTimeout(previousTimer)
    const timer = window.setTimeout(() => {
      const latest = pending.current.get(viewId)
      timers.current.delete(viewId)
      pending.current.delete(viewId)
      if (latest) saveRef.current(viewId, latest)
    }, delayMs)
    timers.current.set(viewId, timer)
  }, [delayMs])
}
