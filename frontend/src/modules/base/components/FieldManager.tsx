import { useMemo, useState } from 'react'
import { Button, Input, Modal, SideSheet, Tag } from '@douyinfe/semi-ui'
import { IconPlus } from '@douyinfe/semi-icons'

import type { CreateDataFieldInput, DataField, DataFieldType, DataTable } from '../types'
import { FormulaEditor } from './FormulaEditor'

const FIELD_TYPES: Array<{ value: DataFieldType; label: string }> = [
  { value: 'TEXT', label: '单行文本' },
  { value: 'LONG_TEXT', label: '多行文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'DATETIME', label: '日期时间' },
  { value: 'SINGLE_SELECT', label: '单选' },
  { value: 'MULTI_SELECT', label: '多选' },
  { value: 'CHECKBOX', label: '复选框' },
  { value: 'LINK', label: '链接' },
  { value: 'ATTACHMENT', label: '附件' },
  { value: 'RELATION', label: '关联记录' },
  { value: 'LOOKUP', label: '查找引用' },
  { value: 'ROLLUP', label: '关联汇总' },
  { value: 'FORMULA', label: '公式' },
  { value: 'CREATED_AT', label: '创建时间' },
  { value: 'UPDATED_AT', label: '更新时间' },
]

const COMPUTED_TYPES = new Set<DataFieldType>(['LOOKUP', 'ROLLUP', 'FORMULA'])
const BASIC_TARGET_TYPES = new Set<DataFieldType>([
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATETIME',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'CHECKBOX',
  'LINK',
  'ATTACHMENT',
  'RELATION',
  'CREATED_AT',
  'UPDATED_AT',
])

const COMMON_KEYS: Record<string, string> = {
  负责人: 'owner',
  状态: 'status',
  截止时间: 'dueAt',
  开始时间: 'startAt',
  描述: 'description',
  标题: 'title',
  名称: 'name',
}

function suggestKey(name: string, sequence: number) {
  const normalized = name.trim()
  if (COMMON_KEYS[normalized]) return COMMON_KEYS[normalized]
  const ascii = normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  return ascii || `field_${sequence + 1}`
}

function relationTargetId(field: DataField) {
  return typeof field.config.targetTableId === 'string' ? field.config.targetTableId : ''
}

function relationFields(table: DataTable) {
  return (table.fields ?? []).filter(
    (field) => field.type === 'RELATION' && Boolean(relationTargetId(field))
  )
}

function targetTableForRelation(fieldId: string, table: DataTable, tables: DataTable[]) {
  const relation = (table.fields ?? []).find(
    (field) => field.id === fieldId && field.type === 'RELATION'
  )
  return relation ? tables.find((item) => item.id === relationTargetId(relation)) : undefined
}

function formulaCandidates(fields: DataField[], currentFieldId?: string) {
  if (!currentFieldId || !fields.some((field) => field.id === currentFieldId)) return fields
  const byId = new Map(fields.map((field) => [field.id, field]))
  const dependsOnCurrent = (field: DataField, visited = new Set<string>()): boolean => {
    if (visited.has(field.id)) return false
    visited.add(field.id)
    const dependencies = Array.isArray(field.config.dependencies)
      ? field.config.dependencies.filter((item): item is string => typeof item === 'string')
      : []
    return dependencies.some((dependencyId) => {
      if (dependencyId === currentFieldId) return true
      const dependency = byId.get(dependencyId)
      return dependency?.type === 'FORMULA' && dependsOnCurrent(dependency, new Set(visited))
    })
  }
  return fields.filter((field) => field.id !== currentFieldId && !dependsOnCurrent(field))
}

function FieldConfigControls({
  type,
  table,
  tables,
  config,
  onConfigChange,
  isCreate,
  inverseFieldName,
  inverseMultiple,
  onInverseFieldNameChange,
  onInverseMultipleChange,
  formulaIdentity,
}: {
  type: DataFieldType
  table: DataTable
  tables: DataTable[]
  config: Record<string, unknown>
  onConfigChange: (config: Record<string, unknown>) => void
  isCreate: boolean
  inverseFieldName?: string
  inverseMultiple?: boolean
  onInverseFieldNameChange?: (value: string) => void
  onInverseMultipleChange?: (value: boolean) => void
  formulaIdentity?: string
}) {
  const update = (patch: Record<string, unknown>) => onConfigChange({ ...config, ...patch })
  const currentRelationFields = relationFields(table)
  const relationFieldId = typeof config.relationFieldId === 'string' ? config.relationFieldId : ''
  const targetTable = targetTableForRelation(relationFieldId, table, tables)
  const targetFields = (targetTable?.fields ?? []).filter((field) =>
    BASIC_TARGET_TYPES.has(field.type)
  )
  const aggregation = typeof config.aggregation === 'string' ? config.aggregation : 'COUNT'
  const relationMode = config.relationMode === 'TWO_WAY' ? 'TWO_WAY' : 'ONE_WAY'
  const allowedTargetTables =
    relationMode === 'TWO_WAY' ? tables.filter((item) => item.source === 'CUSTOM') : tables

  if (type === 'RELATION') {
    return (
      <div className="field-manager__config-grid">
        <label htmlFor={`${isCreate ? 'create' : 'edit'}-relation-table`}>
          <span>目标数据表</span>
          <select
            id={`${isCreate ? 'create' : 'edit'}-relation-table`}
            aria-label="目标数据表"
            value={typeof config.targetTableId === 'string' ? config.targetTableId : ''}
            disabled={
              !isCreate && relationMode === 'TWO_WAY' && typeof config.inverseFieldId === 'string'
            }
            onChange={(event) => update({ targetTableId: event.target.value })}
          >
            <option value="">请选择数据表</option>
            {allowedTargetTables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${isCreate ? 'create' : 'edit'}-relation-count`}>
          <span>关联数量</span>
          <select
            id={`${isCreate ? 'create' : 'edit'}-relation-count`}
            aria-label="关联数量"
            value={config.multiple === true ? 'multiple' : 'single'}
            onChange={(event) => update({ multiple: event.target.value === 'multiple' })}
          >
            <option value="single">单条记录</option>
            <option value="multiple">多条记录</option>
          </select>
        </label>
        <label htmlFor={`${isCreate ? 'create' : 'edit'}-relation-mode`}>
          <span>关联方向</span>
          <select
            id={`${isCreate ? 'create' : 'edit'}-relation-mode`}
            aria-label="关联方向"
            value={relationMode}
            onChange={(event) => {
              const nextMode = event.target.value
              const currentTarget = tables.find((item) => item.id === config.targetTableId)
              update({
                relationMode: nextMode,
                ...(nextMode === 'TWO_WAY' && currentTarget?.source !== 'CUSTOM'
                  ? { targetTableId: undefined }
                  : {}),
              })
            }}
          >
            <option value="ONE_WAY">单向关联</option>
            <option
              value="TWO_WAY"
              disabled={!isCreate && typeof config.inverseFieldId !== 'string'}
            >
              双向关联
            </option>
          </select>
        </label>
        {isCreate && relationMode === 'TWO_WAY' ? (
          <>
            <label htmlFor="create-inverse-name">
              <span>反向字段名称</span>
              <Input
                id="create-inverse-name"
                aria-label="反向字段名称"
                value={inverseFieldName}
                onChange={onInverseFieldNameChange}
              />
            </label>
            <label htmlFor="create-inverse-count">
              <span>反向关联数量</span>
              <select
                id="create-inverse-count"
                aria-label="反向关联数量"
                value={inverseMultiple ? 'multiple' : 'single'}
                onChange={(event) => onInverseMultipleChange?.(event.target.value === 'multiple')}
              >
                <option value="single">单条记录</option>
                <option value="multiple">多条记录</option>
              </select>
            </label>
          </>
        ) : null}
        {!isCreate && typeof config.inverseFieldId === 'string' ? (
          <p className="field-manager__hint">
            反向字段由系统维护，当前字段保存时不会覆盖配对关系。
          </p>
        ) : null}
      </div>
    )
  }

  if (type === 'LOOKUP' || type === 'ROLLUP') {
    const targetCandidates =
      type === 'ROLLUP' && aggregation !== 'COUNT'
        ? targetFields.filter((field) => field.type === 'NUMBER')
        : targetFields
    return (
      <div className="field-manager__config-grid">
        <label htmlFor={`${isCreate ? 'create' : 'edit'}-relation-field`}>
          <span>关联字段</span>
          <select
            id={`${isCreate ? 'create' : 'edit'}-relation-field`}
            aria-label="关联字段"
            value={relationFieldId}
            onChange={(event) =>
              onConfigChange({
                ...config,
                relationFieldId: event.target.value,
                targetFieldId: undefined,
              })
            }
          >
            <option value="">请选择关联字段</option>
            {currentRelationFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        {type === 'ROLLUP' ? (
          <label htmlFor={`${isCreate ? 'create' : 'edit'}-aggregation`}>
            <span>汇总方式</span>
            <select
              id={`${isCreate ? 'create' : 'edit'}-aggregation`}
              aria-label="汇总方式"
              value={aggregation}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  aggregation: event.target.value,
                  targetFieldId: undefined,
                })
              }
            >
              <option value="COUNT">计数</option>
              <option value="SUM">求和</option>
              <option value="AVG">平均值</option>
              <option value="MIN">最小值</option>
              <option value="MAX">最大值</option>
            </select>
          </label>
        ) : null}
        {type === 'LOOKUP' || aggregation !== 'COUNT' ? (
          <label htmlFor={`${isCreate ? 'create' : 'edit'}-target-field`}>
            <span>目标字段</span>
            <select
              id={`${isCreate ? 'create' : 'edit'}-target-field`}
              aria-label="目标字段"
              value={typeof config.targetFieldId === 'string' ? config.targetFieldId : ''}
              onChange={(event) => update({ targetFieldId: event.target.value })}
            >
              <option value="">请选择目标字段</option>
              {targetCandidates.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    )
  }

  if (type === 'FORMULA') {
    return (
      <FormulaEditor
        tableId={table.id}
        identity={formulaIdentity}
        fields={formulaCandidates(table.fields ?? [], formulaIdentity)}
        value={typeof config.expression === 'string' ? config.expression : ''}
        onChange={(expression) => update({ expression })}
      />
    )
  }

  return null
}

function validComputedConfig(type: DataFieldType, config: Record<string, unknown>) {
  if (type === 'RELATION')
    return typeof config.targetTableId === 'string' && Boolean(config.targetTableId)
  if (type === 'LOOKUP') return Boolean(config.relationFieldId && config.targetFieldId)
  if (type === 'ROLLUP') {
    return (
      Boolean(config.relationFieldId) &&
      (config.aggregation === 'COUNT' || Boolean(config.targetFieldId))
    )
  }
  if (type === 'FORMULA')
    return typeof config.expression === 'string' && Boolean(config.expression.trim())
  return true
}

export function FieldManager({
  table,
  tables = [table],
  visible,
  onClose,
  onCreateField,
  onUpdateField,
  onDeleteField,
  isSaving = false,
}: {
  table: DataTable
  tables?: DataTable[]
  visible: boolean
  onClose: () => void
  onCreateField: (input: CreateDataFieldInput) => void | Promise<unknown>
  onUpdateField?: (id: string, input: Partial<CreateDataFieldInput>) => void | Promise<unknown>
  onDeleteField?: (id: string) => unknown
  isSaving?: boolean
}) {
  const fields = useMemo(
    () => [...(table.fields ?? [])].sort((a, b) => a.sequence - b.sequence),
    [table.fields]
  )
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<DataFieldType>('TEXT')
  const [options, setOptions] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [inverseFieldName, setInverseFieldName] = useState('')
  const [inverseMultiple, setInverseMultiple] = useState(true)
  const [editingField, setEditingField] = useState<DataField | null>(null)
  const [editName, setEditName] = useState('')
  const [editRequired, setEditRequired] = useState(false)
  const [editConfig, setEditConfig] = useState<Record<string, unknown>>({})

  function startEditing(field: DataField) {
    setEditingField(field)
    setEditName(field.name)
    setEditRequired(field.isRequired)
    setEditConfig({ ...field.config })
  }

  function closeCreate() {
    setIsCreateOpen(false)
    setName('')
    setType('TEXT')
    setOptions('')
    setConfig({})
    setInverseFieldName('')
    setInverseMultiple(true)
  }

  async function submitCreateField() {
    if (!name.trim() || isSaving || !validComputedConfig(type, config)) return
    const optionList = options
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
    const relationMode = config.relationMode === 'TWO_WAY' ? 'TWO_WAY' : 'ONE_WAY'
    try {
      await onCreateField({
        name: name.trim(),
        key: suggestKey(name, fields.length),
        type,
        ...((type === 'SINGLE_SELECT' || type === 'MULTI_SELECT') && optionList.length
          ? { config: { options: optionList.map((value) => ({ label: value, value })) } }
          : {}),
        ...(['RELATION', 'LOOKUP', 'ROLLUP', 'FORMULA'].includes(type) ? { config } : {}),
        ...(type === 'RELATION' && relationMode === 'TWO_WAY'
          ? { inverseFieldName: inverseFieldName.trim(), inverseMultiple }
          : {}),
      })
    } catch {
      return
    }
    closeCreate()
  }

  async function submitFieldUpdate() {
    if (
      !editingField ||
      !editName.trim() ||
      isSaving ||
      !validComputedConfig(editingField.type, editConfig)
    )
      return
    try {
      await onUpdateField?.(editingField.id, {
        name: editName.trim(),
        ...(!COMPUTED_TYPES.has(editingField.type) ? { isRequired: editRequired } : {}),
        ...(['RELATION', 'LOOKUP', 'ROLLUP', 'FORMULA'].includes(editingField.type)
          ? {
              config:
                editingField.type === 'RELATION'
                  ? Object.fromEntries(
                      Object.entries(editConfig).filter(([key]) => key !== 'inverseFieldId')
                    )
                  : editConfig,
            }
          : {}),
      })
    } catch {
      return
    }
    setEditingField(null)
  }

  return (
    <>
      <SideSheet title="字段管理" visible={visible} onCancel={onClose} width={440}>
        <div className="field-manager">
          <header>
            <div>
              <strong>{table.name}</strong>
              <p>{fields.length} 个字段</p>
            </div>
            {table.source === 'CUSTOM' ? (
              <Button
                aria-label="新增字段"
                icon={<IconPlus />}
                theme="solid"
                type="primary"
                onClick={() => setIsCreateOpen(true)}
              >
                新增字段
              </Button>
            ) : (
              <Tag color="blue">系统字段只读</Tag>
            )}
          </header>
          <ol>
            {fields.map((field, index) => (
              <li key={field.id}>
                <span className="field-manager__drag">⋮⋮</span>
                <div>
                  <strong>{field.name}</strong>
                  <code>{field.key}</code>
                </div>
                <Tag>
                  {FIELD_TYPES.find((item) => item.value === field.type)?.label ?? field.type}
                </Tag>
                {field.isPrimary ? <Tag color="blue">主字段</Tag> : null}
                {table.source === 'CUSTOM' ? (
                  <span className="field-manager__actions">
                    <button
                      type="button"
                      aria-label={`前移字段：${field.name}`}
                      disabled={isSaving || index === 0}
                      onClick={() => {
                        const previous = fields[index - 1]
                        if (!previous) return
                        void onUpdateField?.(field.id, { sequence: previous.sequence })
                        void onUpdateField?.(previous.id, { sequence: field.sequence })
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`后移字段：${field.name}`}
                      disabled={isSaving || index === fields.length - 1}
                      onClick={() => {
                        const next = fields[index + 1]
                        if (!next) return
                        void onUpdateField?.(field.id, { sequence: next.sequence })
                        void onUpdateField?.(next.id, { sequence: field.sequence })
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`编辑字段：${field.name}`}
                      disabled={isSaving}
                      onClick={() => startEditing(field)}
                    >
                      编辑
                    </button>
                    {!field.isPrimary ? (
                      <button
                        type="button"
                        aria-label={`删除字段：${field.name}`}
                        disabled={isSaving}
                        onClick={() => void onDeleteField?.(field.id)}
                      >
                        删除
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </SideSheet>
      <Modal
        title="新增字段"
        visible={isCreateOpen}
        footer={null}
        onCancel={closeCreate}
        width={560}
      >
        <form
          className="field-manager__form"
          onSubmit={(event) => {
            event.preventDefault()
            void submitCreateField()
          }}
        >
          <label htmlFor="base-field-name">
            <span>字段名称</span>
            <Input id="base-field-name" aria-label="字段名称" value={name} onChange={setName} />
          </label>
          <label htmlFor="base-field-type">
            <span>字段类型</span>
            <select
              id="base-field-type"
              aria-label="字段类型"
              value={type}
              onChange={(event) => {
                setType(event.target.value as DataFieldType)
                setConfig(
                  event.target.value === 'ROLLUP'
                    ? { aggregation: 'COUNT' }
                    : event.target.value === 'RELATION'
                      ? { multiple: false, relationMode: 'ONE_WAY' }
                      : {}
                )
              }}
            >
              {FIELD_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {type === 'SINGLE_SELECT' || type === 'MULTI_SELECT' ? (
            <label htmlFor="base-field-options">
              <span>选项</span>
              <Input
                id="base-field-options"
                aria-label="选项"
                value={options}
                onChange={setOptions}
                placeholder="使用逗号分隔，例如：高、中、低"
              />
            </label>
          ) : null}
          <FieldConfigControls
            type={type}
            table={table}
            tables={tables}
            config={config}
            onConfigChange={setConfig}
            isCreate
            inverseFieldName={inverseFieldName}
            inverseMultiple={inverseMultiple}
            onInverseFieldNameChange={setInverseFieldName}
            onInverseMultipleChange={setInverseMultiple}
            formulaIdentity="create-field"
          />
          <Button
            htmlType="submit"
            theme="solid"
            type="primary"
            loading={isSaving}
            disabled={
              !name.trim() ||
              !validComputedConfig(type, config) ||
              (type === 'RELATION' && config.relationMode === 'TWO_WAY' && !inverseFieldName.trim())
            }
          >
            保存字段
          </Button>
        </form>
      </Modal>
      <Modal
        title="编辑字段"
        visible={Boolean(editingField)}
        footer={null}
        onCancel={() => setEditingField(null)}
        width={560}
      >
        <form
          className="field-manager__form"
          onSubmit={(event) => {
            event.preventDefault()
            void submitFieldUpdate()
          }}
        >
          <label htmlFor="base-field-edit-name">
            <span>字段名称</span>
            <Input
              id="base-field-edit-name"
              aria-label="编辑字段名称"
              value={editName}
              onChange={setEditName}
            />
          </label>
          {editingField ? (
            <div className="field-manager__immutable">
              <span>字段类型</span>
              <strong>{FIELD_TYPES.find((item) => item.value === editingField.type)?.label}</strong>
              <small>字段标识 {editingField.key} 创建后不可修改</small>
            </div>
          ) : null}
          {editingField && !COMPUTED_TYPES.has(editingField.type) ? (
            <label htmlFor="base-field-edit-required" className="field-manager__checkbox">
              <input
                id="base-field-edit-required"
                aria-label="字段必填"
                type="checkbox"
                checked={editRequired}
                onChange={(event) => setEditRequired(event.target.checked)}
              />
              <span>必填字段</span>
            </label>
          ) : null}
          {editingField ? (
            <FieldConfigControls
              type={editingField.type}
              table={table}
              tables={tables}
              config={editConfig}
              onConfigChange={setEditConfig}
              isCreate={false}
              formulaIdentity={editingField.id}
            />
          ) : null}
          {editingField && !validComputedConfig(editingField.type, editConfig) ? (
            <p className="field-manager__hint" role="status">
              请补全字段配置后保存。
            </p>
          ) : null}
          <Button
            htmlType="submit"
            theme="solid"
            type="primary"
            loading={isSaving}
            disabled={
              !editName.trim() ||
              !editingField ||
              !validComputedConfig(editingField.type, editConfig)
            }
          >
            保存字段修改
          </Button>
        </form>
      </Modal>
    </>
  )
}
