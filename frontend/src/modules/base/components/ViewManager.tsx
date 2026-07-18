import { useState, type FormEvent } from 'react'

import type { DataView, DataViewType } from '../types'

interface CreateViewInput {
  name: string
  type: DataViewType
  config: Record<string, unknown>
}

interface ViewManagerProps {
  views: DataView[]
  activeViewId?: string
  onSelect: (viewId: string) => void
  onCreate: (input: CreateViewInput) => unknown
  onRename: (viewId: string, name: string) => unknown
  onSave: (viewId: string) => unknown
  onDelete: (viewId: string) => unknown
  isSaving?: boolean
}

const VIEW_TYPES: Array<{ value: DataViewType; label: string }> = [
  { value: 'GRID', label: '表格' },
  { value: 'KANBAN', label: '看板' },
  { value: 'CALENDAR', label: '日历' },
  { value: 'FORM', label: '表单' },
]

const TYPE_LABELS = Object.fromEntries(VIEW_TYPES.map((item) => [item.value, item.label]))

export function ViewManager({
  views,
  activeViewId,
  onSelect,
  onCreate,
  onRename,
  onSave,
  onDelete,
  isSaving = false,
}: ViewManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<DataViewType>('GRID')
  const activeView = views.find((view) => view.id === activeViewId)
  const [renameValue, setRenameValue] = useState(activeView?.name ?? '')

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    await onCreate({ name: trimmedName, type, config: {} })
    setName('')
    setType('GRID')
    setIsCreating(false)
  }

  const openSettings = () => {
    setRenameValue(activeView?.name ?? '')
    setIsEditing((value) => !value)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          minHeight: 36,
          alignItems: 'center',
          gap: 3,
          borderBottom: '1px solid #e5e6eb',
        }}
      >
        <div
          role="tablist"
          aria-label="数据表视图"
          style={{ display: 'flex', gap: 2, overflowX: 'auto' }}
        >
          {views.map((view) => {
            const active = view.id === activeViewId
            return (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(view.id)}
                style={{
                  height: 35,
                  padding: '0 12px',
                  border: 0,
                  borderBottom: active ? '2px solid #3370ff' : '2px solid transparent',
                  background: 'transparent',
                  color: active ? '#1f2329' : '#646a73',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {view.name}
                <span style={{ marginLeft: 6, color: '#bbbfc4', fontSize: 11 }}>
                  {TYPE_LABELS[view.type]}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-label="新增视图"
          onClick={() => setIsCreating((value) => !value)}
          style={ghostButtonStyle}
        >
          ＋ 新增视图
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={openSettings}
          disabled={!activeView}
          style={ghostButtonStyle}
        >
          视图设置
        </button>
      </div>

      {isCreating ? (
        <form
          onSubmit={(event) => void create(event)}
          style={{
            display: 'flex',
            alignItems: 'end',
            gap: 10,
            padding: 12,
            borderRadius: 8,
            background: '#f7f8fa',
          }}
        >
          <label style={labelStyle}>
            视图名称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            视图类型
            <select
              value={type}
              onChange={(event) => setType(event.target.value as DataViewType)}
              style={inputStyle}
            >
              {VIEW_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" style={primaryButtonStyle}>
            确认新增
          </button>
        </form>
      ) : null}

      {isEditing && activeView ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'end',
            gap: 10,
            padding: 12,
            borderRadius: 8,
            background: '#f7f8fa',
          }}
        >
          <label style={labelStyle}>
            重命名视图
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              style={inputStyle}
            />
          </label>
          <button
            type="button"
            onClick={() => void onRename(activeView.id, renameValue.trim())}
            disabled={!renameValue.trim() || isSaving}
            style={secondaryButtonStyle}
          >
            保存名称
          </button>
          <button
            type="button"
            onClick={() => void onSave(activeView.id)}
            disabled={isSaving}
            style={secondaryButtonStyle}
          >
            保存当前配置
          </button>
          <button
            type="button"
            onClick={() => void onDelete(activeView.id)}
            disabled={isSaving}
            style={{ ...secondaryButtonStyle, color: '#f54a45' }}
          >
            删除当前视图
          </button>
        </div>
      ) : null}
    </div>
  )
}

const ghostButtonStyle: React.CSSProperties = {
  height: 30,
  padding: '0 9px',
  border: 0,
  borderRadius: 6,
  background: 'transparent',
  color: '#646a73',
  fontSize: 12,
  cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  color: '#646a73',
  fontSize: 12,
}

const inputStyle: React.CSSProperties = {
  minWidth: 160,
  height: 32,
  padding: '0 9px',
  border: '1px solid #dee0e3',
  borderRadius: 6,
  background: '#fff',
  color: '#1f2329',
}

const primaryButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 13px',
  border: 0,
  borderRadius: 6,
  background: '#3370ff',
  color: '#fff',
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  border: '1px solid #dee0e3',
  borderRadius: 6,
  background: '#fff',
  color: '#1f2329',
  cursor: 'pointer',
}
