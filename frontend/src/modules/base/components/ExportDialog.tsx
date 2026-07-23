import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useState } from 'react'
import { Button, Modal, Toast } from '@douyinfe/semi-ui'
import { downloadBaseExport } from '../api'
import type { DataTable, DataView } from '../types'

export function ExportDialog({ visible, table, view, onClose }: { visible: boolean; table: DataTable; view: DataView | null; onClose: () => void }) {
  const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx')
  const [scope, setScope] = useState<'view' | 'all'>('view')
  const [pending, setPending] = useState(false)
  async function run() {
    if (pending) return
    setPending(true)
    try {
      const file = await downloadBaseExport(table.id, { format, scope, ...(scope === 'view' && view ? { viewId: view.id } : {}) })
      const url = URL.createObjectURL(file.blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.fileName; anchor.click(); URL.revokeObjectURL(url)
      onClose()
    } catch { Toast.error('导出失败。') } finally { setPending(false) }
  }
  return (
    <Modal title="导出多维表格" visible={visible} footer={null} onCancel={onClose} width={480}>
      <div className="base-export-dialog">
        <div>
          <span id="base-export-format-label">文件格式</span>
          <WorkspaceFormSelect
            aria-labelledby="base-export-format-label"
            value={format}
            onChange={(event) => setFormat(event.target.value as 'csv' | 'xlsx')}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </WorkspaceFormSelect>
        </div>
        <div>
          <span id="base-export-scope-label">导出范围</span>
          <WorkspaceFormSelect
            aria-labelledby="base-export-scope-label"
            value={scope}
            onChange={(event) => setScope(event.target.value as 'view' | 'all')}
          >
            <option value="view" disabled={!view}>当前视图（筛选、排序、可见字段）</option>
            <option value="all">完整数据表</option>
          </WorkspaceFormSelect>
        </div>
        <p>导出会读取全部记录，不受当前页面 100 条限制。</p>
        <Button theme="solid" type="primary" loading={pending} onClick={() => void run()}>
          开始导出
        </Button>
      </div>
    </Modal>
  )
}
