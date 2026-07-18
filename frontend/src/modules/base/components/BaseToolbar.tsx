import { Button, Tag } from '@douyinfe/semi-ui'
import { IconPlus, IconSetting } from '@douyinfe/semi-icons'
import type { DataTable } from '../types'

export function BaseToolbar({
  table,
  onManageFields,
  onCreateRecord,
}: {
  table: DataTable
  onManageFields: () => void
  onCreateRecord?: () => void
}) {
  return (
    <header className="base-toolbar">
      <div className="base-toolbar__identity">
        <div>
          <h2>{table.name}</h2>
          <p>{table.description || (table.source === 'CUSTOM' ? '自定义数据表' : '实时连接业务对象')}</p>
        </div>
        {table.source !== 'CUSTOM' ? <Tag color="blue">实时数据</Tag> : null}
      </div>
      <div className="base-toolbar__view-row">
        <span className="base-toolbar__hint">{table.source === 'CUSTOM' ? '自定义数据' : '编辑将同步回原业务对象'}</span>
        <div className="base-toolbar__actions">
          <Button aria-label="字段管理" icon={<IconSetting />} onClick={onManageFields}>字段管理</Button>
          {table.source === 'CUSTOM' && onCreateRecord ? (
            <Button icon={<IconPlus />} theme="solid" type="primary" onClick={onCreateRecord}>新增记录</Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
