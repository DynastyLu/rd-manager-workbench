import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useState, type FormEvent } from 'react'
import { Button, Input, Modal } from '@douyinfe/semi-ui'

import type { DataField, DataView, DataViewConfig, DataViewType } from '../types'
import { sharedViewConfig } from '../viewSettings'
import { ViewSettingsDrawer } from './ViewSettingsDrawer'

interface CreateViewInput {
  name: string
  type: DataViewType
  config: DataViewConfig
}

interface ViewManagerProps {
  views: DataView[]
  fields?: DataField[]
  activeViewId?: string
  onSelect: (viewId: string) => void
  onCreate: (input: CreateViewInput) => unknown
  onRename: (viewId: string, name: string) => unknown
  onConfigChange?: (config: DataViewConfig) => unknown
  onSave?: (viewId: string) => unknown
  onDelete: (viewId: string) => unknown
  onSetDefault?: (viewId: string) => unknown
  isSaving?: boolean
}

const VIEW_TYPES: Array<{ value: DataViewType; label: string; icon: string; description: string }> =
  [
    { value: 'GRID', label: '表格', icon: '▦', description: '像表格一样快速录入与编辑' },
    { value: 'KANBAN', label: '看板', icon: '▥', description: '按状态分组推进工作' },
    { value: 'CALENDAR', label: '日历', icon: '◫', description: '按日期查看安排与节点' },
    { value: 'FORM', label: '表单', icon: '✎', description: '通过结构化表单收集记录' },
    { value: 'GANTT', label: '甘特', icon: '▰', description: '沿时间轴查看计划与进度' },
    { value: 'GALLERY', label: '画册', icon: '▧', description: '以卡片浏览封面与关键信息' },
  ]

const TYPE_META = Object.fromEntries(VIEW_TYPES.map((item) => [item.value, item])) as Record<
  DataViewType,
  (typeof VIEW_TYPES)[number]
>

export function ViewManager({
  views,
  fields = [],
  activeViewId,
  onSelect,
  onCreate,
  onRename,
  onConfigChange = () => undefined,
  onSave,
  onDelete,
  onSetDefault = () => undefined,
  isSaving = false,
}: ViewManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<DataViewType>('GRID')
  const activeView = views.find((view) => view.id === activeViewId)

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || !name.trim()) return
    await onCreate({
      name: name.trim(),
      type,
      config: activeView ? sharedViewConfig(activeView.config, fields) : {},
    })
    setName('')
    setType('GRID')
    setIsCreating(false)
  }

  return (
    <div className="view-manager">
      <div className="view-manager__bar">
        <div role="tablist" aria-label="数据表视图" className="view-manager__tabs">
          {views.map((view) => {
            const active = view.id === activeViewId
            const meta = TYPE_META[view.type]
            return (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(view.id)}
                className={`view-manager__tab${active ? ' view-manager__tab--active' : ''}`}
              >
                <span aria-hidden="true">{meta.icon}</span>
                <span>{view.name}</span>
                {view.isDefault ? <small>默认</small> : null}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-label="新增视图"
          onClick={() => setIsCreating(true)}
          className="view-manager__ghost-button"
        >
          ＋ 新增视图
        </button>
        <div className="view-manager__spacer" />
        <button
          type="button"
          aria-label="视图设置"
          onClick={() => setIsSettingsOpen(true)}
          disabled={!activeView}
          className="view-manager__ghost-button"
        >
          ⚙ 视图设置
        </button>
      </div>

      <Modal
        title="新建视图"
        visible={isCreating}
        footer={null}
        width={520}
        onCancel={() => setIsCreating(false)}
      >
        <form className="view-create" onSubmit={(event) => void create(event)}>
          <label htmlFor="view-create-name">视图名称</label>
          <Input
            id="view-create-name"
            aria-label="视图名称"
            value={name}
            onChange={setName}
            placeholder="例如：本周重点"
          />
          <label htmlFor="view-create-type">视图类型</label>
          <WorkspaceFormSelect
            id="view-create-type"
            aria-label="视图类型"
            value={type}
            onChange={(event) => setType(event.target.value as DataViewType)}
          >
            {VIEW_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </WorkspaceFormSelect>
          <div className="view-create__preview">
            <span aria-hidden="true">{TYPE_META[type].icon}</span>
            <div>
              <strong>{TYPE_META[type].label}</strong>
              <p>{TYPE_META[type].description}</p>
            </div>
          </div>
          <p className="view-create__inheritance">
            将继承当前视图的筛选、排序、分组和字段显示设置。
          </p>
          <Button
            htmlType="submit"
            theme="solid"
            type="primary"
            loading={isSaving}
            disabled={!name.trim() || isSaving}
          >
            确认新增
          </Button>
        </form>
      </Modal>

      {activeView ? (
        <ViewSettingsDrawer
          visible={isSettingsOpen}
          view={activeView}
          fields={fields}
          onClose={() => setIsSettingsOpen(false)}
          onConfigChange={onConfigChange}
          onRename={onRename}
          onSave={onSave}
          onDelete={onDelete}
          onSetDefault={onSetDefault}
          isSaving={isSaving}
        />
      ) : null}
    </div>
  )
}
