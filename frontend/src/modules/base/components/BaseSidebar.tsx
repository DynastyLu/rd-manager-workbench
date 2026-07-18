import { Button } from '@douyinfe/semi-ui'
import { IconPlus } from '@douyinfe/semi-icons'
import type { DataTable, DataWorkspace } from '../types'

const SOURCE_LABEL: Record<DataTable['source'], string> = {
  CUSTOM: '自定义',
  PROJECTS: '项目',
  WORK_TASKS: '任务',
  MEETING_ACTIONS: '会议',
  DOCUMENTS: '文档',
  RISKS_DECISIONS: '治理',
}

export function BaseSidebar({
  workspace,
  selectedTableId,
  onSelectTable,
  onCreateTable,
}: {
  workspace: DataWorkspace
  selectedTableId: string | null
  onSelectTable: (table: DataTable) => void
  onCreateTable: () => void
}) {
  const tables = [...(workspace.tables ?? [])].sort((left, right) => left.sequence - right.sequence)

  return (
    <aside className="base-sidebar" aria-label="多维表格目录">
      <div className="base-sidebar__workspace">
        <span className="base-sidebar__mark">B</span>
        <div>
          <h1>{workspace.name}</h1>
          <p>{workspace.description || '本地单人数据空间'}</p>
        </div>
      </div>
      <div className="base-sidebar__section-title">
        <span>数据表</span>
        <Button icon={<IconPlus />} theme="borderless" size="small" aria-label="新建数据表" onClick={onCreateTable} />
      </div>
      <nav className="base-sidebar__tables" aria-label="数据表">
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            aria-label={table.name}
            aria-pressed={table.id === selectedTableId}
            className={table.id === selectedTableId ? 'base-sidebar__table base-sidebar__table--active' : 'base-sidebar__table'}
            onClick={() => onSelectTable(table)}
          >
            <span className="base-sidebar__table-icon">{table.name.slice(0, 1)}</span>
            <span className="base-sidebar__table-name">{table.name}</span>
            <span className="base-sidebar__source">{SOURCE_LABEL[table.source]}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
