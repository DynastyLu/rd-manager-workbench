import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, SideSheet } from '@douyinfe/semi-ui'

import type { DataField, DataView, DataViewConfig, ViewSort } from '../types'
import { isComputedFieldType, isFilterValid, normalizeClientViewConfig } from '../viewSettings'
import { GallerySettingsSection } from './GallerySettingsSection'
import { ViewFilterBuilder } from './ViewFilterBuilder'

const SORT_LIMIT = 5
function isConfigValid(config: DataViewConfig, fields: DataField[]) {
  const filters = config.filters ?? []
  const sorts = config.sorts ?? []
  if (filters.length > 20 || sorts.length > SORT_LIMIT) return false
  if (!filters.every((filter) => isFilterValid(filter, fields))) return false
  return sorts.every((sort) =>
    fields.some((field) => field.key === sort.fieldKey && !isComputedFieldType(field.type))
  )
}

function SortBuilder({
  fields,
  sorts,
  onChange,
}: {
  fields: DataField[]
  sorts: ViewSort[]
  onChange: (sorts: ViewSort[]) => void
}) {
  const sortableFields = fields.filter((field) => !isComputedFieldType(field.type))
  return (
    <section className="view-settings__section" aria-labelledby="view-sort-heading">
      <div className="view-settings__section-heading">
        <div>
          <h3 id="view-sort-heading">排序</h3>
          <p>按优先级依次比较字段</p>
        </div>
        <span>
          {sorts.length}/{SORT_LIMIT}
        </span>
      </div>
      <div className="view-sort-list">
        {sorts.map((sort, index) => {
          const field = fields.find((item) => item.key === sort.fieldKey)
          return (
            <div className="view-sort-row" key={`${index}:${sort.fieldKey}`}>
              <span>{index + 1}</span>
              <select
                aria-label={`排序字段 ${index + 1}`}
                value={sort.fieldKey}
                onChange={(event) =>
                  onChange(
                    sorts.map((item, currentIndex) =>
                      currentIndex === index ? { ...item, fieldKey: event.target.value } : item
                    )
                  )
                }
              >
                {!field ? <option value={sort.fieldKey}>失效字段</option> : null}
                {sortableFields.map((option) => (
                  <option key={option.id} value={option.key}>
                    {option.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={`排序方向 ${index + 1}`}
                value={sort.direction}
                onChange={(event) =>
                  onChange(
                    sorts.map((item, currentIndex) =>
                      currentIndex === index
                        ? { ...item, direction: event.target.value as ViewSort['direction'] }
                        : item
                    )
                  )
                }
              >
                <option value="asc">升序</option>
                <option value="desc">降序</option>
              </select>
              {!field ? (
                <span className="view-filter-row__invalid">字段已失效：{sort.fieldKey}</span>
              ) : null}
              <button
                type="button"
                aria-label={`删除排序条件 ${index + 1}`}
                className="view-settings__icon-button"
                onClick={() => onChange(sorts.filter((_, currentIndex) => currentIndex !== index))}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        aria-label="添加排序条件"
        className="view-settings__add-button"
        disabled={sorts.length >= SORT_LIMIT || sortableFields.length === 0}
        onClick={() => {
          const firstField = sortableFields[0]
          if (firstField) onChange([...sorts, { fieldKey: firstField.key, direction: 'asc' }])
        }}
      >
        ＋ 添加排序条件
      </button>
    </section>
  )
}

const GANTT_TITLE_FIELD_TYPES = new Set<DataField['type']>([
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATETIME',
  'SINGLE_SELECT',
  'LINK',
  'LOOKUP',
  'ROLLUP',
  'FORMULA',
  'CREATED_AT',
  'UPDATED_AT',
])

function GanttSettings({
  fields,
  config,
  onChange,
}: {
  fields: DataField[]
  config: DataViewConfig
  onChange: (config: DataViewConfig) => void
}) {
  const primaryField = fields.find((field) => field.isPrimary)
  const titleFields = fields.filter(
    (field) => field.isPrimary || GANTT_TITLE_FIELD_TYPES.has(field.type)
  )
  const dateFields = fields.filter((field) => field.type === 'DATETIME')
  const selectedTitleExists = !config.titleFieldKey
    || titleFields.some((field) => field.key === config.titleFieldKey)
  const selectedStartExists = !config.startFieldKey
    || dateFields.some((field) => field.key === config.startFieldKey)
  const selectedEndExists = !config.endFieldKey
    || dateFields.some((field) => field.key === config.endFieldKey)

  return (
    <section className="view-settings__section" aria-labelledby="gantt-settings-heading">
      <div className="view-settings__section-heading">
        <div>
          <h3 id="gantt-settings-heading">甘特设置</h3>
          <p>日期字段可相同；同字段会显示为单日任务条</p>
        </div>
      </div>
      <label className="view-settings__stacked-field">
        <span>标题字段</span>
        <select
          aria-label="甘特标题字段"
          value={String(config.titleFieldKey ?? '')}
          onChange={(event) => onChange({
            ...config,
            titleFieldKey: event.target.value || undefined,
          })}
        >
          <option value="">跟随主字段{primaryField ? `（${primaryField.name}）` : ''}</option>
          {!selectedTitleExists ? <option value={config.titleFieldKey}>失效字段</option> : null}
          {titleFields.map((field) => (
            <option key={field.id} value={field.key}>
              {field.name}{field.isPrimary ? '（主字段）' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="view-settings__stacked-field">
        <span>开始字段</span>
        <select
          aria-label="甘特开始字段"
          value={String(config.startFieldKey ?? '')}
          onChange={(event) => onChange({
            ...config,
            startFieldKey: event.target.value || undefined,
          })}
        >
          <option value="">请选择基础日期字段</option>
          {!selectedStartExists ? <option value={config.startFieldKey}>失效字段</option> : null}
          {dateFields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select>
      </label>
      <label className="view-settings__stacked-field">
        <span>结束字段</span>
        <select
          aria-label="甘特结束字段"
          value={String(config.endFieldKey ?? '')}
          onChange={(event) => onChange({
            ...config,
            endFieldKey: event.target.value || undefined,
          })}
        >
          <option value="">请选择基础日期字段</option>
          {!selectedEndExists ? <option value={config.endFieldKey}>失效字段</option> : null}
          {dateFields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select>
      </label>
      <label className="view-settings__stacked-field">
        <span>时间缩放</span>
        <select
          aria-label="甘特缩放"
          value={config.scale ?? 'WEEK'}
          onChange={(event) => onChange({
            ...config,
            scale: event.target.value as NonNullable<DataViewConfig['scale']>,
          })}
        >
          <option value="DAY">日</option>
          <option value="WEEK">周</option>
          <option value="MONTH">月</option>
        </select>
      </label>
      <label className="view-settings__stacked-field">
        <span>行高</span>
        <select
          aria-label="甘特行高"
          value={config.rowHeight ?? 'STANDARD'}
          onChange={(event) => onChange({
            ...config,
            rowHeight: event.target.value as NonNullable<DataViewConfig['rowHeight']>,
          })}
        >
          <option value="COMPACT">紧凑</option>
          <option value="STANDARD">标准</option>
        </select>
      </label>
    </section>
  )
}

interface ViewSettingsDrawerProps {
  visible: boolean
  view: DataView
  fields: DataField[]
  onClose: () => void
  onConfigChange: (config: DataViewConfig) => unknown
  onRename: (viewId: string, name: string) => unknown
  onDelete: (viewId: string) => unknown
  onSetDefault: (viewId: string) => unknown
  onSave?: (viewId: string) => unknown
  isSaving?: boolean
}

export function ViewSettingsDrawer({
  visible,
  view,
  fields,
  onClose,
  onConfigChange,
  onRename,
  onDelete,
  onSetDefault,
  onSave,
  isSaving = false,
}: ViewSettingsDrawerProps) {
  const [draft, setDraft] = useState<DataViewConfig>(() =>
    normalizeClientViewConfig(view.config, fields)
  )
  const [name, setName] = useState(view.name)
  const viewIdRef = useRef(view.id)

  useEffect(() => {
    viewIdRef.current = view.id
    // A rejected optimistic save or a view switch must replace the local invalid draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(normalizeClientViewConfig(view.config, fields))
    setName(view.name)
  }, [fields, view.id, view.config, view.name])

  function updateDraft(next: DataViewConfig) {
    setDraft(next)
    if (isConfigValid(next, fields)) onConfigChange(next)
  }

  const hasInvalidConditions = !isConfigValid(draft, fields)
  const configurableFields = fields.filter((field) => !isComputedFieldType(field.type))

  return (
    <SideSheet
      title={
        <div className="view-settings__title">
          <span>视图设置</span>
          <small>{view.name}</small>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      width={480}
      bodyStyle={{ padding: 0 }}
    >
      <div className="view-settings">
        <section className="view-settings__section view-settings__identity">
          <label htmlFor="view-settings-name">视图名称</label>
          <div>
            <Input
              id="view-settings-name"
              aria-label="重命名视图"
              value={name}
              onChange={setName}
            />
            <Button
              disabled={!name.trim() || isSaving}
              onClick={() => void onRename(view.id, name.trim())}
            >
              保存名称
            </Button>
          </div>
          <label htmlFor="view-settings-query">视图内保存的搜索</label>
          <Input
            id="view-settings-query"
            aria-label="视图内保存的搜索"
            value={String(draft.query ?? '')}
            placeholder="刷新后仍会应用；表格顶部搜索不会保存"
            onChange={(query) => updateDraft({ ...draft, query: query || undefined })}
          />
        </section>

        <ViewFilterBuilder
          fields={fields}
          filters={draft.filters ?? []}
          onChange={(filters) => updateDraft({ ...draft, filters })}
        />
        <SortBuilder
          fields={fields}
          sorts={draft.sorts ?? []}
          onChange={(sorts) => updateDraft({ ...draft, sorts })}
        />

        {view.type === 'GANTT' ? (
          <GanttSettings fields={fields} config={draft} onChange={updateDraft} />
        ) : null}
        {view.type === 'GALLERY' ? (
          <GallerySettingsSection fields={fields} config={draft} onChange={updateDraft} />
        ) : null}

        <section className="view-settings__section">
          <div className="view-settings__section-heading">
            <div>
              <h3>布局</h3>
              <p>分组与字段显示只影响当前视图</p>
            </div>
          </div>
          <label className="view-settings__stacked-field">
            <span>分组字段</span>
            <select
              aria-label="视图分组字段"
              value={String(draft.groupField ?? '')}
              onChange={(event) =>
                updateDraft({ ...draft, groupField: event.target.value || undefined })
              }
            >
              <option value="">不分组</option>
              {configurableFields.map((field) => (
                <option key={field.id} value={field.key}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>
          <div className="view-settings__fields" aria-label="显示字段">
            {fields.map((field) => (
              <Checkbox
                key={field.id}
                checked={field.isPrimary || !(draft.hiddenFieldIds ?? []).includes(field.id)}
                disabled={field.isPrimary}
                onChange={(event) => {
                  const hidden = new Set(draft.hiddenFieldIds ?? [])
                  if (event.target.checked) hidden.delete(field.id)
                  else hidden.add(field.id)
                  updateDraft({ ...draft, hiddenFieldIds: [...hidden] })
                }}
              >
                {field.name}
              </Checkbox>
            ))}
          </div>
        </section>

        {hasInvalidConditions ? (
          <p className="view-settings__validation" role="alert">
            请补全筛选条件后再保存
          </p>
        ) : null}

        <section className="view-settings__section view-settings__actions">
          {!view.isDefault ? (
            <Button disabled={isSaving} onClick={() => void onSetDefault(view.id)}>
              设为默认视图
            </Button>
          ) : (
            <span className="view-settings__default-badge">当前默认视图</span>
          )}
          {onSave ? (
            <Button
              disabled={isSaving || hasInvalidConditions}
              onClick={() => void onSave(viewIdRef.current)}
            >
              保存当前配置
            </Button>
          ) : null}
          <Button type="danger" disabled={isSaving} onClick={() => void onDelete(view.id)}>
            删除当前视图
          </Button>
        </section>
      </div>
    </SideSheet>
  )
}
