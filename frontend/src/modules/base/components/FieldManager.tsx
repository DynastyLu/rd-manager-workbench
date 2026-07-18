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
  isSaving = false,
}: {
  table: DataTable
  visible: boolean
  onClose: () => void
  onCreateField: (input: CreateDataFieldInput) => void
  isSaving?: boolean
}) {
  const fields = useMemo(() => [...(table.fields ?? [])].sort((a, b) => a.sequence - b.sequence), [table.fields])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<DataFieldType>('TEXT')
  const [options, setOptions] = useState('')

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
            {fields.map((field: DataField) => (
              <li key={field.id}>
                <span className="field-manager__drag">⋮⋮</span>
                <div><strong>{field.name}</strong><code>{field.key}</code></div>
                <Tag>{FIELD_TYPES.find((item) => item.value === field.type)?.label ?? field.type}</Tag>
                {field.isPrimary ? <Tag color="blue">主字段</Tag> : null}
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
            if (!name.trim()) return
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
    </>
  )
}
