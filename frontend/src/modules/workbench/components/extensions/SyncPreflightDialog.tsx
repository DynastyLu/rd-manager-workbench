import { Banner, Button, ButtonGroup, Modal, Tag } from '@douyinfe/semi-ui'
import type { SyncResolution } from '@/modules/workbench/api/extensions'

export interface SyncPreflightItem {
  id: string
  title: string
  action: 'ADD' | 'UPDATE' | 'CONFLICT'
  detail?: string
  allowedResolutions?: SyncResolution[]
}

interface SyncPreflightDialogProps {
  visible: boolean
  direction: 'PULL_ONLY' | 'BIDIRECTIONAL'
  items: SyncPreflightItem[]
  resolutions: Record<string, SyncResolution>
  committing?: boolean
  onResolutionChange: (id: string, resolution: SyncResolution) => void
  onCancel: () => void
  onCommit: () => void
}

export function SyncPreflightDialog({
  visible,
  direction,
  items,
  resolutions,
  committing,
  onResolutionChange,
  onCancel,
  onCommit,
}: SyncPreflightDialogProps) {
  const conflicts = items.filter((item) => item.action === 'CONFLICT')
  const decisionItems = items.filter((item) => (item.allowedResolutions?.length ?? 0) > 0 || item.action === 'CONFLICT')
  const unresolved = decisionItems.filter((item) => !resolutions[item.id]).length
  return (
    <Modal
      visible={visible}
      title="同步预检"
      onCancel={onCancel}
      footer={(
        <div className="extension-dialog__actions">
          <Button onClick={onCancel}>取消</Button>
          <Button theme="solid" type="primary" disabled={unresolved > 0} loading={committing} onClick={onCommit}>确认同步</Button>
        </div>
      )}
    >
      <Banner
        type={conflicts.length ? 'warning' : 'info'}
        fullMode={false}
        closeIcon={null}
        title={direction === 'PULL_ONLY' ? '当前仅从外部拉取' : '当前为双向同步'}
        description={conflicts.length ? `${conflicts.length} 项冲突需要先选择保留本地、保留远端或创建副本。` : '只有确认后才会修改本地或远端对象。'}
      />
      <div className="sync-preflight-list">
        {items.map((item) => (
          <div key={item.id} className="sync-preflight-list__item">
            <Tag color={item.action === 'CONFLICT' ? 'orange' : item.action === 'ADD' ? 'green' : 'blue'}>{item.action}</Tag>
            <div>
              <strong>{item.title}</strong>{item.detail ? <small>{item.detail}</small> : null}
              {(item.allowedResolutions?.length || item.action === 'CONFLICT') ? (
                <ButtonGroup className="sync-preflight-list__resolutions">
                  {([
                    ['KEEP_LOCAL', '保留本地'],
                    ['KEEP_REMOTE', '保留远端'],
                    ['CREATE_COPY', '创建副本'],
                  ] as const).filter(([resolution]) => !item.allowedResolutions || item.allowedResolutions.includes(resolution)).map(([resolution, label]) => (
                    <Button
                      key={resolution}
                      size="small"
                      theme={resolutions[item.id] === resolution ? 'solid' : 'light'}
                      type={resolutions[item.id] === resolution ? 'primary' : 'tertiary'}
                      aria-label={`${item.title}：${label}`}
                      onClick={() => onResolutionChange(item.id, resolution)}
                    >
                      {label}
                    </Button>
                  ))}
                </ButtonGroup>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
