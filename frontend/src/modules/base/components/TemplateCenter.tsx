import { useEffect, useState } from 'react'
import { Banner, Button, Input, Modal, Spin, Toast } from '@douyinfe/semi-ui'
import { getBaseTemplate, instantiateBaseTemplate, listBaseTemplates } from '../api'
import type { DataTable, DataTableTemplateDetail, DataTableTemplateSummary } from '../types'

const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: '文本',
  LONG_TEXT: '多行文本',
  NUMBER: '数字',
  DATETIME: '日期时间',
  SINGLE_SELECT: '单选',
  MULTI_SELECT: '多选',
  CHECKBOX: '勾选',
  LINK: '链接',
  RELATION: '关联记录',
  LOOKUP: '查找引用',
  ROLLUP: '关联汇总',
  FORMULA: '公式',
  CREATED_AT: '创建时间',
}

const VIEW_TYPE_LABELS: Record<string, string> = {
  GRID: '表格',
  KANBAN: '看板',
  CALENDAR: '日历',
  GANTT: '甘特',
  GALLERY: '画册',
  FORM: '表单',
}

export function TemplateCenter({
  visible,
  workspaceId,
  onClose,
  onCreated,
  onCreateBlank,
}: {
  visible: boolean
  workspaceId: string
  onClose: () => void
  onCreated: (table: DataTable) => void
  onCreateBlank?: (name: string) => Promise<DataTable>
}) {
  const [tab, setTab] = useState<'templates' | 'blank'>('templates')
  const [templates, setTemplates] = useState<DataTableTemplateSummary[]>([])
  const [selected, setSelected] = useState<DataTableTemplateDetail | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible) return
    setError('')
    void listBaseTemplates()
      .then(setTemplates)
      .catch(() => setError('模板目录加载失败，请稍后重试。'))
  }, [visible])

  async function openTemplate(template: DataTableTemplateSummary) {
    setLoading(true)
    setError('')
    try {
      const detail = await getBaseTemplate(template.key)
      setSelected(detail)
      setName(detail.name)
    } catch {
      setError('模板详情加载失败。')
    } finally {
      setLoading(false)
    }
  }

  async function createSelected() {
    if (!selected || !name.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const created = await instantiateBaseTemplate(workspaceId, selected.key, { name: name.trim() })
      onCreated(created)
      setSelected(null)
      onClose()
    } catch {
      setError('创建失败，当前选择和名称已保留。')
    } finally {
      setLoading(false)
    }
  }

  async function createBlank() {
    if (!onCreateBlank || !name.trim() || loading) return
    setLoading(true)
    try {
      const created = await onCreateBlank(name.trim())
      onCreated(created)
      onClose()
    } catch {
      Toast.error('空白表格创建失败。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="新建数据表"
      visible={visible}
      footer={(
        <div className="workspace-modal-footer">
          <Button onClick={onClose}>取消</Button>
          {tab === 'blank' ? (
            <Button theme="solid" type="primary" disabled={!name.trim() || !onCreateBlank} loading={loading} onClick={() => void createBlank()}>创建空白表格</Button>
          ) : selected ? (
            <Button theme="solid" type="primary" loading={loading} disabled={!name.trim()} onClick={() => void createSelected()}>创建此模板</Button>
          ) : null}
        </div>
      )}
      onCancel={onClose}
      width={860}
    >
      <div className="template-center">
        <div className="template-center__tabs" role="tablist">
          <button type="button" aria-pressed={tab === 'templates'} onClick={() => { setTab('templates'); setSelected(null) }}>从模板创建</button>
          <button type="button" aria-pressed={tab === 'blank'} onClick={() => { setTab('blank'); setSelected(null); setName('') }}>空白表格</button>
        </div>
        {error ? <Banner type="danger" fullMode={false} description={error} closeIcon={null} /> : null}
        {tab === 'blank' ? (
          <div className="template-center__blank">
            <h3>从一张干净的表格开始</h3>
            <p>创建标题字段、表格视图和表单视图，之后可自由扩展。</p>
            <Input aria-label="数据表名称" value={name} onChange={setName} placeholder="例如：新产品调研" />
          </div>
        ) : selected ? (
          <div className="template-preview">
            <button type="button" className="template-preview__back" onClick={() => setSelected(null)}>← 返回模板中心</button>
            <div className="template-preview__hero"><span>{selected.icon}</span><div><h3>{selected.name}</h3><p>{selected.description}</p></div></div>
            <label htmlFor="base-template-table-name"><span>新表名称</span><Input id="base-template-table-name" value={name} onChange={setName} /></label>
            <div className="template-preview__lists">
              <section><h4>字段 · {selected.fields.length}</h4>{selected.fields.map((field) => <span key={field.key}>{field.name}<small>{FIELD_TYPE_LABELS[field.type] ?? field.type}</small></span>)}</section>
              <section><h4>视图 · {selected.views.length}</h4>{selected.views.map((view) => <span key={view.name}>{view.name}<small>{VIEW_TYPE_LABELS[view.type] ?? view.type}</small></span>)}</section>
            </div>
          </div>
        ) : loading && !templates.length ? <Spin /> : (
          <div className="template-center__grid">
            {templates.map((template) => (
              <button key={template.key} type="button" aria-label={`${template.name}，${template.description}`} onClick={() => void openTemplate(template)}>
                <span>{template.icon}</span><div><strong>{template.name}</strong><p>{template.description}</p><small>{template.fieldCount} 个字段 · {template.viewTypes.join(' / ')}</small></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
