import { useMemo, useState } from 'react'
import { Banner, Button, Empty, Input, Modal, SideSheet, Skeleton, Toast } from '@douyinfe/semi-ui'
import { Link } from 'react-router-dom'
import { BaseSidebar } from '@/modules/base/components/BaseSidebar'
import { BaseToolbar } from '@/modules/base/components/BaseToolbar'
import { FieldManager } from '@/modules/base/components/FieldManager'
import { GridView } from '@/modules/base/components/GridView'
import { CalendarView } from '@/modules/base/components/CalendarView'
import { FormView } from '@/modules/base/components/FormView'
import { KanbanView } from '@/modules/base/components/KanbanView'
import { ViewManager } from '@/modules/base/components/ViewManager'
import {
  useBaseRecords,
  useBaseWorkspaces,
  useCreateBaseField,
  useCreateBaseRecord,
  useCreateBaseTable,
  useDebouncedViewConfigSave,
  useDeleteBaseField,
  useUpdateBaseRecord,
  useUpdateBaseField,
  useUpdateBaseView,
} from '@/modules/base/hooks'
import { createBaseView, deleteBaseView, updateBaseView } from '@/modules/base/api'
import type { BaseRecord, BaseRecordQuery, DataTable, DataView, DataViewConfig, DataViewType } from '@/modules/base/types'
import './LibraryHomePage.less'

const VIEW_SAVE_DELAY_MS = 350

function viewQuery(config: DataViewConfig): BaseRecordQuery {
  return {
    ...(config.query ? { query: config.query } : {}),
    ...(config.filterField ? { filterField: config.filterField } : {}),
    ...(config.filterValue ? { filterValue: config.filterValue } : {}),
    ...(config.sortField ? { sortField: config.sortField } : {}),
    ...(config.sortOrder ? { sortOrder: config.sortOrder } : {}),
    page: 1,
    pageSize: 100,
  }
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '未填写'
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return `${value}`
  return '未填写'
}

export default function LibraryHomePage() {
  const workspacesQuery = useBaseWorkspaces()
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const [viewOverrides, setViewOverrides] = useState<Record<string, DataViewConfig>>({})
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false)
  const [tableName, setTableName] = useState('')
  const [isFieldManagerOpen, setIsFieldManagerOpen] = useState(false)
  const [isViewSaving, setIsViewSaving] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<BaseRecord | null>(null)
  const createTableMutation = useCreateBaseTable()
  const createFieldMutation = useCreateBaseField()
  const updateFieldMutation = useUpdateBaseField()
  const deleteFieldMutation = useDeleteBaseField()
  const createRecordMutation = useCreateBaseRecord()
  const updateRecordMutation = useUpdateBaseRecord()
  const updateViewMutation = useUpdateBaseView()
  const debounceViewSave = useDebouncedViewConfigSave((id, config) => {
    updateViewMutation.mutate({ id, config })
  }, VIEW_SAVE_DELAY_MS)

  const workspace = workspacesQuery.data?.[0]
  const tables = useMemo(() => workspace?.tables ?? [], [workspace?.tables])
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0] ?? null
  const views = useMemo(() => selectedTable?.views ?? [], [selectedTable?.views])
  const selectedView = views.find((view) => view.id === selectedViewId) ?? views.find((view) => view.isDefault) ?? views[0] ?? null
  const resolvedView = useMemo<DataView | null>(() => selectedView ? {
    ...selectedView,
    config: viewOverrides[selectedView.id] ?? selectedView.config,
  } : null, [selectedView, viewOverrides])
  const recordsQuery = useBaseRecords(selectedTable?.id ?? null, viewQuery(resolvedView?.config ?? {}))

  function selectTable(table: DataTable) {
    setSelectedTableId(table.id)
    setSelectedViewId(table.views?.find((view) => view.isDefault)?.id ?? table.views?.[0]?.id ?? null)
    setSelectedRecord(null)
  }

  function saveViewConfig(config: DataViewConfig) {
    if (!resolvedView) return
    setViewOverrides((current) => ({ ...current, [resolvedView.id]: config }))
    debounceViewSave(resolvedView.id, config)
  }

  async function refreshViews() {
    await workspacesQuery.refetch()
  }

  async function runViewOperation<T>(operation: () => Promise<T>, errorMessage: string) {
    if (isViewSaving) return undefined
    setIsViewSaving(true)
    try {
      return await operation()
    } catch {
      Toast.error(errorMessage)
      return undefined
    } finally {
      setIsViewSaving(false)
    }
  }

  if (workspacesQuery.isPending) {
    return <div className="base-loading"><Skeleton loading placeholder={<Skeleton.Paragraph rows={8} />} /><p>正在加载多维表格…</p></div>
  }

  if (workspacesQuery.isError) {
    return (
      <div className="base-loading">
        <Banner type="danger" fullMode={false} title="无法读取多维表格" description="请确认本地后端和 PostgreSQL 已启动。" closeIcon={null}>
          <Button onClick={() => void workspacesQuery.refetch()}>重试</Button>
        </Banner>
      </div>
    )
  }

  if (!workspace) return <div className="base-loading"><Empty title="还没有数据工作区" description="后端将在首次访问时创建研发工作台。" /></div>

  const fields = selectedTable?.fields ?? []
  const records = recordsQuery.data?.data ?? []

  return (
    <div className="base-page">
      <BaseSidebar workspace={workspace} selectedTableId={selectedTable?.id ?? null} onSelectTable={selectTable} onCreateTable={() => setIsCreateTableOpen(true)} />
      <main className="base-page__main">
        {selectedTable ? (
          <>
            <BaseToolbar
              table={selectedTable}
              isCreatingRecord={createRecordMutation.isPending}
              onManageFields={() => setIsFieldManagerOpen(true)}
              onCreateRecord={() => {
                const primaryField = fields.find((field) => field.isPrimary)
                createRecordMutation.mutate(
                  { tableId: selectedTable.id, values: primaryField ? { [primaryField.key]: '未命名记录' } : {} },
                )
              }}
            />
            <ViewManager
              views={views}
              activeViewId={resolvedView?.id}
              isSaving={isViewSaving || updateViewMutation.isPending}
              onSelect={(id) => setSelectedViewId(id)}
              onCreate={async ({ name, type, config }: { name: string; type: DataViewType; config: Record<string, unknown> }) => {
                const created = await runViewOperation(async () => {
                  const next = await createBaseView(selectedTable.id, { name, type, config })
                  await refreshViews()
                  return next
                }, '创建视图失败。')
                if (created) setSelectedViewId(created.id)
              }}
              onRename={(id, name) => runViewOperation(async () => { await updateBaseView(id, { name }); await refreshViews() }, '重命名视图失败。')}
              onSave={(id) => runViewOperation(async () => { await updateBaseView(id, { config: resolvedView?.config ?? {} }); await refreshViews() }, '保存视图失败。')}
              onDelete={(id) => runViewOperation(async () => { await deleteBaseView(id); await refreshViews() }, '删除视图失败。')}
            />
            <div className="base-page__content">
              {recordsQuery.isPending ? <Skeleton loading placeholder={<Skeleton.Paragraph rows={10} />} /> : null}
              {recordsQuery.isError ? <Banner type="danger" fullMode={false} title="无法读取数据记录" description="数据表结构已加载，但记录服务暂时不可用。" closeIcon={null}><Button onClick={() => void recordsQuery.refetch()}>重试</Button></Banner> : null}
              {recordsQuery.data && resolvedView ? (
                resolvedView.type === 'GRID' ? (
                  <GridView fields={fields} records={records} view={resolvedView} isSaving={updateRecordMutation.isPending} onRecordSelect={setSelectedRecord} onRecordChange={(recordId, values) => updateRecordMutation.mutate({ tableId: selectedTable.id, recordId, values })} onViewChange={saveViewConfig} />
                ) : resolvedView.type === 'KANBAN' ? (
                  <KanbanView fields={fields} records={records} groupFieldKey={String(resolvedView.config.groupField ?? '') || undefined} onGroupFieldChange={(groupField) => saveViewConfig({ ...resolvedView.config, groupField })} onRecordUpdate={(recordId, input) => updateRecordMutation.mutate({ tableId: selectedTable.id, recordId, values: input.values })} onOpenRecord={setSelectedRecord} />
                ) : resolvedView.type === 'CALENDAR' ? (
                  <CalendarView fields={fields} records={records} dateFieldKey={String(resolvedView.config.dateField ?? '') || undefined} onDateFieldChange={(dateField) => saveViewConfig({ ...resolvedView.config, dateField })} onOpenRecord={setSelectedRecord} />
                ) : (
                  <FormView tableSource={selectedTable.source} fields={fields} isSubmitting={createRecordMutation.isPending} onCreateRecord={(input) => createRecordMutation.mutateAsync({ tableId: selectedTable.id, values: input.values })} />
                )
              ) : null}
            </div>
          </>
        ) : <Empty title="还没有数据表" description="从左侧新建一张自定义数据表。" />}
      </main>

      <Modal title="新建数据表" visible={isCreateTableOpen} footer={null} onCancel={() => setIsCreateTableOpen(false)} width={480}>
        <form className="base-dialog-form" onSubmit={(event) => { event.preventDefault(); if (!tableName.trim() || createTableMutation.isPending) return; createTableMutation.mutate({ workspaceId: workspace.id, name: tableName.trim() }, { onSuccess: (created) => { setSelectedTableId(created.id); setTableName(''); setIsCreateTableOpen(false) } }) }}>
          <label htmlFor="base-table-name"><span>数据表名称</span><Input id="base-table-name" aria-label="数据表名称" value={tableName} onChange={setTableName} placeholder="例如：面试候选人" /></label>
          <Button htmlType="submit" theme="solid" type="primary" loading={createTableMutation.isPending} disabled={!tableName.trim()}>保存数据表</Button>
        </form>
      </Modal>

      {selectedTable ? <FieldManager
        table={selectedTable}
        visible={isFieldManagerOpen}
        onClose={() => setIsFieldManagerOpen(false)}
        isSaving={createFieldMutation.isPending || updateFieldMutation.isPending || deleteFieldMutation.isPending}
        onCreateField={(input) => createFieldMutation.mutate({ tableId: selectedTable.id, input })}
        onUpdateField={(id, input) => updateFieldMutation.mutate({ id, input })}
        onDeleteField={(id) => deleteFieldMutation.mutate({ id })}
      /> : null}

      <SideSheet title="记录详情" visible={Boolean(selectedRecord)} onCancel={() => setSelectedRecord(null)} width={460}>
        {selectedRecord && selectedTable ? <div className="base-record-detail">{fields.map((field) => <div key={field.id}><span>{field.name}</span><strong>{valueText(selectedRecord.values[field.key])}</strong></div>)}{selectedRecord.sourcePath ? <Link to={selectedRecord.sourcePath}>打开原业务对象 →</Link> : null}</div> : null}
      </SideSheet>
    </div>
  )
}
