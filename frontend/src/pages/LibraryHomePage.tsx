import { useEffect, useMemo, useRef, useState } from 'react'
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
import { RelationValue } from '@/modules/base/components/RelationPicker'
import { ComputedFieldExplanation } from '@/modules/base/components/ComputedFieldExplanation'
import {
  useBaseRecords,
  useBaseWorkspaces,
  useCreateBaseField,
  useCreateBaseRecord,
  useCreateBaseTable,
  useDebouncedViewConfigSave,
  useDeleteBaseField,
  useGridRelationRecords,
  useUpdateBaseRecord,
  useUpdateBaseField,
} from '@/modules/base/hooks'
import { createBaseView, deleteBaseView, updateBaseView } from '@/modules/base/api'
import type { BaseRecord, BaseRecordQuery, DataField, DataTable, DataView, DataViewConfig, DataViewType } from '@/modules/base/types'
import './LibraryHomePage.less'

const VIEW_SAVE_DELAY_MS = 350

function viewQuery(viewId: string | undefined, temporaryQuery: string): BaseRecordQuery {
  return {
    ...(viewId ? { viewId } : {}),
    ...(temporaryQuery.trim() ? { query: temporaryQuery.trim() } : {}),
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

function RecordDetailValue({
  field,
  record,
  fields,
  tables,
}: {
  field: DataField
  record: BaseRecord
  fields: DataField[]
  tables: DataTable[]
}) {
  const error = record.computedErrors?.[field.key]
  if (error) {
    const text = error.code === 'DIV_ZERO' ? '#DIV/0!' : error.code === 'CYCLE' ? '#CYCLE!' : '⚠ 计算错误'
    return <strong className="base-record-detail__error" title={error.message}>{text}<small>{error.message}</small></strong>
  }
  const targetTable = field.type === 'RELATION' && typeof field.config.targetTableId === 'string'
    ? tables.find((table) => table.id === field.config.targetTableId)
    : undefined
  return (
    <strong>
      {targetTable
        ? <RelationValue field={field} targetTable={targetTable} value={record.values[field.key]} />
        : valueText(record.values[field.key])}
      {['LOOKUP', 'ROLLUP', 'FORMULA'].includes(field.type) ? <small><ComputedFieldExplanation field={field} fields={fields} tables={tables} /></small> : null}
    </strong>
  )
}

export default function LibraryHomePage() {
  const workspacesQuery = useBaseWorkspaces()
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const [viewOverrides, setViewOverrides] = useState<Record<string, DataViewConfig>>({})
  const [temporaryQuery, setTemporaryQuery] = useState('')
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false)
  const [tableName, setTableName] = useState('')
  const [isFieldManagerOpen, setIsFieldManagerOpen] = useState(false)
  const [isViewSaving, setIsViewSaving] = useState(false)
  const [isConfigSaving, setIsConfigSaving] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<BaseRecord | null>(null)
  const serverViewConfigs = useRef(new Map<string, DataViewConfig>())
  const createTableMutation = useCreateBaseTable()
  const createFieldMutation = useCreateBaseField()
  const updateFieldMutation = useUpdateBaseField()
  const deleteFieldMutation = useDeleteBaseField()
  const createRecordMutation = useCreateBaseRecord()
  const updateRecordMutation = useUpdateBaseRecord()
  const debounceViewSave = useDebouncedViewConfigSave((id, config) => {
    setIsConfigSaving(true)
    void updateBaseView(id, { config })
      .then((updated) => {
        serverViewConfigs.current.set(id, updated.config)
        setViewOverrides((current) => ({ ...current, [id]: updated.config }))
      })
      .catch(() => {
        setViewOverrides((current) => {
          const serverConfig = serverViewConfigs.current.get(id)
          if (!serverConfig) {
            const next = { ...current }
            delete next[id]
            return next
          }
          return { ...current, [id]: { ...serverConfig } }
        })
        Toast.error('视图配置保存失败。已恢复服务端配置。')
      })
      .finally(() => setIsConfigSaving(false))
  }, VIEW_SAVE_DELAY_MS)

  const workspace = workspacesQuery.data?.[0]
  const tables = useMemo(() => workspace?.tables ?? [], [workspace?.tables])
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0] ?? null
  const views = useMemo(() => selectedTable?.views ?? [], [selectedTable?.views])
  useEffect(() => {
    serverViewConfigs.current = new Map(views.map((view) => [view.id, view.config]))
  }, [views])
  const selectedView = views.find((view) => view.id === selectedViewId) ?? views.find((view) => view.isDefault) ?? views[0] ?? null
  const resolvedView = useMemo<DataView | null>(() => selectedView ? {
    ...selectedView,
    config: viewOverrides[selectedView.id] ?? selectedView.config,
  } : null, [selectedView, viewOverrides])
  const resolvedViews = useMemo(
    () => views.map((view) => view.id === resolvedView?.id ? resolvedView : view),
    [resolvedView, views],
  )
  const recordsQuery = useBaseRecords(
    selectedTable?.id ?? null,
    viewQuery(resolvedView?.id, temporaryQuery),
  )
  const fields = selectedTable?.fields ?? []
  const records = recordsQuery.data?.data ?? []
  const relationLookups = useGridRelationRecords(
    fields,
    resolvedView?.type === 'GRID' ? records : []
  )

  function selectTable(table: DataTable) {
    setSelectedTableId(table.id)
    setSelectedViewId(table.views?.find((view) => view.isDefault)?.id ?? table.views?.[0]?.id ?? null)
    setSelectedRecord(null)
    setTemporaryQuery('')
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

  async function openCreateRecordForm() {
    if (!selectedTable) return
    const formView = views.find((view) => view.type === 'FORM')
    if (formView) {
      setSelectedViewId(formView.id)
      return
    }
    const created = await runViewOperation(async () => {
      const next = await createBaseView(selectedTable.id, { name: '表单', type: 'FORM', config: {} })
      await refreshViews()
      return next
    }, '创建表单视图失败。')
    if (created) setSelectedViewId(created.id)
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
              onCreateRecord={() => void openCreateRecordForm()}
            />
            <ViewManager
              views={resolvedViews}
              fields={fields}
              activeViewId={resolvedView?.id}
              isSaving={isViewSaving || isConfigSaving}
              onSelect={(id) => {
                setSelectedViewId(id)
                setTemporaryQuery('')
              }}
              onCreate={async ({ name, type, config }: { name: string; type: DataViewType; config: DataViewConfig }) => {
                const created = await runViewOperation(async () => {
                  const next = await createBaseView(selectedTable.id, { name, type, config })
                  await refreshViews()
                  return next
                }, '创建视图失败。')
                if (created) setSelectedViewId(created.id)
              }}
              onRename={(id, name) => runViewOperation(async () => { await updateBaseView(id, { name }); await refreshViews() }, '重命名视图失败。')}
              onConfigChange={saveViewConfig}
              onSave={(id) => runViewOperation(async () => { await updateBaseView(id, { config: resolvedView?.config ?? {} }); await refreshViews() }, '保存视图失败。')}
              onDelete={(id) => runViewOperation(async () => { await deleteBaseView(id); await refreshViews() }, '删除视图失败。')}
              onSetDefault={(id) => runViewOperation(async () => { await updateBaseView(id, { isDefault: true }); await refreshViews() }, '设置默认视图失败。')}
            />
            <div className="base-page__content">
              {recordsQuery.isPending ? <Skeleton loading placeholder={<Skeleton.Paragraph rows={10} />} /> : null}
              {recordsQuery.isError ? <Banner type="danger" fullMode={false} title="无法读取数据记录" description="数据表结构已加载，但记录服务暂时不可用。" closeIcon={null}><Button onClick={() => void recordsQuery.refetch()}>重试</Button></Banner> : null}
              {recordsQuery.data && resolvedView ? (
                resolvedView.type === 'GRID' ? (
                  <GridView fields={fields} tables={tables} records={records} relationLookups={relationLookups} view={resolvedView} temporaryQuery={temporaryQuery} onTemporaryQueryChange={setTemporaryQuery} isSaving={updateRecordMutation.isPending} onRecordSelect={setSelectedRecord} onRecordChange={(recordId, values) => updateRecordMutation.mutate({ tableId: selectedTable.id, recordId, values })} onViewChange={saveViewConfig} />
                ) : resolvedView.type === 'KANBAN' ? (
                  <KanbanView fields={fields} records={records} groupFieldKey={String(resolvedView.config.groupField ?? '') || undefined} isUpdating={updateRecordMutation.isPending} onGroupFieldChange={(groupField) => saveViewConfig({ ...resolvedView.config, groupField })} onRecordUpdate={(recordId, input) => updateRecordMutation.mutate({ tableId: selectedTable.id, recordId, values: input.values })} onOpenRecord={setSelectedRecord} />
                ) : resolvedView.type === 'CALENDAR' ? (
                  <CalendarView fields={fields} records={records} dateFieldKey={String(resolvedView.config.dateField ?? '') || undefined} onDateFieldChange={(dateField) => saveViewConfig({ ...resolvedView.config, dateField })} onOpenRecord={setSelectedRecord} />
                ) : (
                  <FormView tableSource={selectedTable.source} fields={fields} tables={tables} isSubmitting={createRecordMutation.isPending} onCreateRecord={(input) => createRecordMutation.mutateAsync({ tableId: selectedTable.id, values: input.values })} />
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
        tables={tables}
        visible={isFieldManagerOpen}
        onClose={() => setIsFieldManagerOpen(false)}
        isSaving={createFieldMutation.isPending || updateFieldMutation.isPending || deleteFieldMutation.isPending}
        onCreateField={(input) => createFieldMutation.mutateAsync({ tableId: selectedTable.id, input })}
        onUpdateField={(id, input) => updateFieldMutation.mutateAsync({ id, input })}
        onDeleteField={(id) => deleteFieldMutation.mutate({ id })}
      /> : null}

      <SideSheet title="记录详情" visible={Boolean(selectedRecord)} onCancel={() => setSelectedRecord(null)} width={460}>
        {selectedRecord && selectedTable ? <div className="base-record-detail">{fields.map((field) => <div key={field.id}><span>{field.name}</span><RecordDetailValue field={field} record={selectedRecord} fields={fields} tables={tables} /></div>)}{selectedRecord.sourcePath ? <Link to={selectedRecord.sourcePath}>打开原业务对象 →</Link> : null}</div> : null}
      </SideSheet>
    </div>
  )
}
