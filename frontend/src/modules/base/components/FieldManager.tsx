import { useMemo, useState } from 'react'
import { Button, Input, Modal, SideSheet, Tag } from '@douyinfe/semi-ui'
import { IconPlus } from '@douyinfe/semi-icons'
import type { CreateDataFieldInput, DataField, DataFieldType, DataTable } from '../types'

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
  { value: 'CREATED_AT', label: '创建时间' },
  { value: 'UPDATED_AT', label: '更新时间' },
]

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

export function FieldManager({
  table,
  visible,
  onClose,
  onCreateField,
  onUpdateField,
  onDeleteField,
  isSaving = false,
}: {
  table: DataTable
  visible: boolean
  onClose: () => void
  onCreateField: (input: CreateDataFieldInput) => void
  onUpdateField?: (id: string, input: Partial<CreateDataFieldInput>) => unknown
  onDeleteField?: (id: string) => unknown
  isSaving?: boolean
}) {
  const fields = useMemo(() => [...(table.fields ?? [])].sort((a, b) => a.sequence - b.sequence), [table.fields])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<DataFieldType>('TEXT')
  const [options, setOptions] = useState('')
  const [editingField, setEditingField] = useState<DataField | null>(null)
  const [editName, setEditName] = useState('')
  const [editRequired, setEditRequired] = useState(false)

  function startEditing(field: DataField) {
    setEditingField(field)
    setEditName(field.name)
    setEditRequired(field.isRequired)
  }

  function closeCreate() {
    setIsCreateOpen(false)
    setName('')
    setType('TEXT')
    setOptions('')
  }

  return (
    <>
      <SideSheet title="字段管理" visible={visible} onCancel={onClose} width={440}>
        <div className="field-manager">
          <header>
            <div><strong>{table.name}</strong><p>{fields.length} 个字段</p></div>
            {table.source === 'CUSTOM' ? <Button aria-label="新增字段" icon={<IconPlus />} theme="solid" type="primary" onClick={() => setIsCreateOpen(true)}>新增字段</Button> : <Tag color="blue">系统字段只读</Tag>}
          </header>
          <ol>
            {fields.map((field: DataField, index) => (
              <li key={field.id}>
                <span className="field-manager__drag">⋮⋮</span>
                <div><strong>{field.name}</strong><code>{field.key}</code></div>
                <Tag>{FIELD_TYPES.find((item) => item.value === field.type)?.label ?? field.type}</Tag>
                {field.isPrimary ? <Tag color="blue">主字段</Tag> : null}
                {table.source === 'CUSTOM' ? (
                  <span className="field-manager__actions">
                    <button type="button" aria-label={`前移字段：${field.name}`} disabled={isSaving || index === 0} onClick={() => {
                      const previous = fields[index - 1]
                      if (!previous) return
                      void onUpdateField?.(field.id, { sequence: previous.sequence })
                      void onUpdateField?.(previous.id, { sequence: field.sequence })
                    }}>↑</button>
                    <button type="button" aria-label={`后移字段：${field.name}`} disabled={isSaving || index === fields.length - 1} onClick={() => {
                      const next = fields[index + 1]
                      if (!next) return
                      void onUpdateField?.(field.id, { sequence: next.sequence })
                      void onUpdateField?.(next.id, { sequence: field.sequence })
                    }}>↓</button>
                    <button type="button" aria-label={`编辑字段：${field.name}`} disabled={isSaving} onClick={() => startEditing(field)}>编辑</button>
                    {!field.isPrimary ? <button type="button" aria-label={`删除字段：${field.name}`} disabled={isSaving} onClick={() => void onDeleteField?.(field.id)}>删除</button> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </SideSheet>
      <Modal title="新增字段" visible={isCreateOpen} footer={null} onCancel={closeCreate} width={460}>
        <form
          className="field-manager__form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim() || isSaving) return
            const optionList = options.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
            onCreateField({
              name: name.trim(),
              key: suggestKey(name, fields.length),
              type,
              ...((type === 'SINGLE_SELECT' || type === 'MULTI_SELECT') && optionList.length ? {
                config: { options: optionList.map((value) => ({ label: value, value })) },
              } : {}),
            })
            closeCreate()
          }}
        >
          <label htmlFor="base-field-name"><span>字段名称</span><Input id="base-field-name" aria-label="字段名称" value={name} onChange={setName} /></label>
          <label htmlFor="base-field-type">
            <span>字段类型</span>
            <select id="base-field-type" aria-label="字段类型" value={type} onChange={(event) => setType(event.target.value as DataFieldType)}>
              {FIELD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {type === 'SINGLE_SELECT' || type === 'MULTI_SELECT' ? (
            <label htmlFor="base-field-options"><span>选项</span><Input id="base-field-options" aria-label="选项" value={options} onChange={setOptions} placeholder="使用逗号分隔，例如：高、中、低" /></label>
          ) : null}
          <Button htmlType="submit" theme="solid" type="primary" loading={isSaving} disabled={!name.trim()}>保存字段</Button>
        </form>
      </Modal>
      <Modal title="编辑字段" visible={Boolean(editingField)} footer={null} onCancel={() => setEditingField(null)} width={460}>
        <form className="field-manager__form" onSubmit={(event) => {
          event.preventDefault()
          if (!editingField || !editName.trim() || isSaving) return
          void onUpdateField?.(editingField.id, { name: editName.trim(), isRequired: editRequired })
          setEditingField(null)
        }}>
          <label htmlFor="base-field-edit-name"><span>字段名称</span><Input id="base-field-edit-name" aria-label="编辑字段名称" value={editName} onChange={setEditName} /></label>
          <label htmlFor="base-field-edit-required" className="field-manager__checkbox"><input id="base-field-edit-required" aria-label="字段必填" type="checkbox" checked={editRequired} onChange={(event) => setEditRequired(event.target.checked)} /><span>必填字段</span></label>
          <Button htmlType="submit" theme="solid" type="primary" loading={isSaving} disabled={!editName.trim()}>保存字段修改</Button>
        </form>
      </Modal>
    </>
  )
}
