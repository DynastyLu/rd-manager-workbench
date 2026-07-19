import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Toast } from '@douyinfe/semi-ui'
import {
  createBaseField,
  createBaseRecord,
  createBaseTable,
  deleteBaseField,
  listBaseRecords,
  listBaseWorkspaces,
  previewBaseFormula,
  updateBaseField,
  updateBaseRecord,
  updateBaseView,
} from './api'
import type {
  BaseRecord,
  BaseRecordQuery,
  CreateDataFieldInput,
  DataField,
  DataViewConfig,
  FormulaPreviewInput,
  RelationRecordLookup,
} from './types'

export const baseKeys = {
  workspaces: ['base', 'workspaces'] as const,
  records: (tableId: string, query: BaseRecordQuery) =>
    ['base', 'records', tableId, query] as const,
  infiniteRecords: (tableId: string, query: BaseRecordQuery) =>
    ['base', 'records', 'infinite', tableId, query] as const,
  selectedRecords: (tableId: string, recordIds: string[]) =>
    ['base', 'records', 'selected', tableId, recordIds] as const,
}

function invalidateBase(client: ReturnType<typeof useQueryClient>) {
  return client.invalidateQueries({ queryKey: ['base'] })
}

export function useBaseWorkspaces() {
  return useQuery({ queryKey: baseKeys.workspaces, queryFn: listBaseWorkspaces })
}

export function useBaseRecords(tableId: string | null, query: BaseRecordQuery, enabled = true) {
  return useQuery({
    queryKey: baseKeys.records(tableId ?? '', query),
    queryFn: () => listBaseRecords(tableId!, query),
    placeholderData: (previousData) => previousData,
    enabled: Boolean(tableId) && enabled,
  })
}

export function useInfiniteBaseRecords(
  tableId: string | null,
  query: BaseRecordQuery,
  enabled = true
) {
  return useInfiniteQuery({
    queryKey: baseKeys.infiniteRecords(tableId ?? '', query),
    queryFn: ({ pageParam }) =>
      listBaseRecords(tableId!, { ...query, page: pageParam, pageSize: 100 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page * lastPage.meta.pageSize < lastPage.meta.total
        ? lastPage.meta.page + 1
        : undefined,
    enabled: Boolean(tableId) && enabled,
  })
}

export function useAllBaseRecords(tableId: string | null, query: BaseRecordQuery, enabled = true) {
  const result = useInfiniteBaseRecords(tableId, query, enabled)
  const { fetchNextPage, hasNextPage, isFetchNextPageError } = result
  const isLoadingAllPages = useRef(false)

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetchNextPageError || isLoadingAllPages.current) return
    isLoadingAllPages.current = true
    void (async () => {
      try {
        let nextPage = await fetchNextPage({ throwOnError: true })
        while (nextPage.hasNextPage) {
          nextPage = await fetchNextPage({ throwOnError: true })
        }
      } catch {
        // React Query retains the page error for the view and a manual refetch can resume loading.
      } finally {
        isLoadingAllPages.current = false
      }
    })()
  }, [enabled, fetchNextPage, hasNextPage, isFetchNextPageError])

  const data = useMemo(() => {
    const pages = result.data?.pages
    if (!pages?.length) return undefined
    return {
      data: pages.flatMap((page) => page.data),
      meta: {
        page: pages.length,
        pageSize: 100,
        total: pages[0]!.meta.total,
      },
    }
  }, [result.data?.pages])

  return { ...result, data }
}

export function useSelectedBaseRecords(tableId: string | null, recordIds: string[]) {
  const uniqueIds = [...new Set(recordIds)]
  const batches = Array.from({ length: Math.ceil(uniqueIds.length / 100) }, (_, index) =>
    uniqueIds.slice(index * 100, (index + 1) * 100)
  )
  const results = useQueries({
    queries: batches.map((batch) => ({
      queryKey: baseKeys.selectedRecords(tableId ?? '', batch),
      queryFn: () => listBaseRecords(tableId!, { recordIds: batch, page: 1, pageSize: 100 }),
      enabled: Boolean(tableId),
    })),
  })
  const byId = new Map(
    results.flatMap((result) => result.data?.data ?? []).map((record) => [record.id, record])
  )
  const data = uniqueIds.flatMap((id) => {
    const record = byId.get(id)
    return record ? [record] : []
  })
  return {
    data: { data, meta: { page: 1, pageSize: 100, total: data.length } },
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
    isSuccess: results.length > 0 && results.every((result) => result.isSuccess),
    refetch: () => Promise.all(results.map((result) => result.refetch())),
  }
}

export function useGridRelationRecords(fields: DataField[], records: BaseRecord[]) {
  const idsByTable = new Map<string, string[]>()
  const seenByTable = new Map<string, Set<string>>()
  for (const field of fields) {
    if (field.type !== 'RELATION' || typeof field.config.targetTableId !== 'string') continue
    const targetTableId = field.config.targetTableId
    const ids = idsByTable.get(targetTableId) ?? []
    const seen = seenByTable.get(targetTableId) ?? new Set<string>()
    idsByTable.set(targetTableId, ids)
    seenByTable.set(targetTableId, seen)
    for (const record of records) {
      const value = record.values[field.key]
      const recordIds = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
      for (const recordId of recordIds) {
        if (typeof recordId !== 'string' || !recordId || seen.has(recordId)) continue
        seen.add(recordId)
        ids.push(recordId)
      }
    }
  }
  const batches = [...idsByTable].flatMap(([tableId, recordIds]) =>
    Array.from({ length: Math.ceil(recordIds.length / 100) }, (_, index) => ({
      tableId,
      recordIds: recordIds.slice(index * 100, (index + 1) * 100),
    }))
  )
  const results = useQueries({
    queries: batches.map(({ tableId, recordIds }) => ({
      queryKey: baseKeys.selectedRecords(tableId, recordIds),
      queryFn: () => listBaseRecords(tableId, { recordIds, page: 1, pageSize: 100 }),
    })),
  })
  const lookups = new Map<string, RelationRecordLookup>()
  for (const [tableId] of idsByTable) {
    const indexes = batches.flatMap((batch, index) => (batch.tableId === tableId ? [index] : []))
    const tableResults = indexes.map((index) => results[index]!)
    const byId = new Map(
      tableResults.flatMap((result) => result.data?.data ?? []).map((record) => [record.id, record])
    )
    const ordered = (idsByTable.get(tableId) ?? []).flatMap((id) => {
      const record = byId.get(id)
      return record ? [record] : []
    })
    lookups.set(tableId, {
      records: ordered,
      isPending: tableResults.some((result) => result.isPending),
      isError: tableResults.some((result) => result.isError),
      isSuccess: tableResults.every((result) => result.isSuccess),
      refetch: () => Promise.all(tableResults.map((result) => result.refetch())),
    })
  }
  return lookups
}

export function useCreateBaseTable() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) =>
      createBaseTable(workspaceId, { name }),
    onSuccess: () => invalidateBase(client),
    onError: () => Toast.error('创建数据表失败。'),
  })
}

export function useCreateBaseField() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, input }: { tableId: string; input: CreateDataFieldInput }) =>
      createBaseField(tableId, input),
    onSuccess: () => invalidateBase(client),
    onError: () => Toast.error('新增字段失败。'),
  })
}

export function useUpdateBaseField() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateDataFieldInput> }) =>
      updateBaseField(id, input),
    onSuccess: () => invalidateBase(client),
    onError: () => Toast.error('更新字段失败。'),
  })
}

export function useDeleteBaseField() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteBaseField(id),
    onSuccess: () => invalidateBase(client),
    onError: () => Toast.error('删除字段失败。'),
  })
}

export function useCreateBaseRecord() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tableId, values }: { tableId: string; values: Record<string, unknown> }) =>
      createBaseRecord(tableId, values),
    onSuccess: () => invalidateBase(client),
    onError: () => Toast.error('新增记录失败。'),
  })
}

export function useUpdateBaseRecord() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      tableId,
      recordId,
      values,
    }: {
      tableId: string
      recordId: string
      values: Record<string, unknown>
    }) => updateBaseRecord(tableId, recordId, values),
    onSuccess: (_, input) =>
      Promise.all([
        invalidateBase(client),
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

export function usePreviewBaseFormula(tableId: string) {
  return useMutation({
    mutationFn: (input: FormulaPreviewInput) => previewBaseFormula(tableId, input),
  })
}

export function useUpdateBaseView() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: DataViewConfig }) =>
      updateBaseView(id, { config }),
    onSuccess: () => client.invalidateQueries({ queryKey: baseKeys.workspaces }),
    onError: () => Toast.error('视图配置保存失败。'),
  })
}

export function useDebouncedViewConfigSave(
  save: (viewId: string, config: DataViewConfig) => unknown,
  delayMs = 350
) {
  const timers = useRef(new Map<string, number>())
  const pending = useRef(new Map<string, DataViewConfig>())
  const queues = useRef(new Map<string, Promise<void>>())
  const saveRef = useRef(save)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const enqueue = useCallback((viewId: string, config: DataViewConfig) => {
    const previous = queues.current.get(viewId) ?? Promise.resolve()
    const operation = previous
      .catch(() => undefined)
      .then(() => saveRef.current(viewId, config))
      .then(() => undefined)
    const tracked = operation
      .catch(() => undefined)
      .finally(() => {
        if (queues.current.get(viewId) === tracked) queues.current.delete(viewId)
      })
    queues.current.set(viewId, tracked)
  }, [])

  const cancel = useCallback((viewId: string) => {
    const timer = timers.current.get(viewId)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(viewId)
    pending.current.delete(viewId)
  }, [])

  const flush = useCallback(
    (viewId: string, config?: DataViewConfig) => {
      const timer = timers.current.get(viewId)
      if (timer !== undefined) window.clearTimeout(timer)
      const latest = pending.current.get(viewId) ?? config
      timers.current.delete(viewId)
      pending.current.delete(viewId)
      if (latest) enqueue(viewId, latest)
    },
    [enqueue]
  )

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer)
      for (const [viewId, config] of pending.current) enqueue(viewId, config)
      timers.current.clear()
      pending.current.clear()
    },
    [enqueue]
  )

  const schedule = useCallback(
    (viewId: string, config: DataViewConfig) => {
      pending.current.set(viewId, config)
      const previousTimer = timers.current.get(viewId)
      if (previousTimer !== undefined) window.clearTimeout(previousTimer)
      const timer = window.setTimeout(() => {
        const latest = pending.current.get(viewId)
        timers.current.delete(viewId)
        pending.current.delete(viewId)
        if (latest) enqueue(viewId, latest)
      }, delayMs)
      timers.current.set(viewId, timer)
    },
    [delayMs, enqueue]
  )

  return { schedule, cancel, flush }
}
