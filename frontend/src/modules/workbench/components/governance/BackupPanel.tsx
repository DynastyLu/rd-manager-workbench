import { Button, Empty, Tag } from '@douyinfe/semi-ui'
import { IconDelete, IconRefresh, IconShield } from '@douyinfe/semi-icons'

import type { BackupRecord } from '@/modules/workbench/api/governance'

const STATUS_LABELS: Record<BackupRecord['status'], string> = {
  CREATING: '创建中',
  CREATED: '待验证',
  VERIFIED: '已验证',
  RESTORING: '恢复中',
  RESTORED: '已恢复',
  FAILED: '失败',
}

const KIND_LABELS: Record<BackupRecord['kind'], string> = {
  MANUAL: '手动',
  SCHEDULED: '自动',
  PRE_RESTORE: '恢复前保护',
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export interface BackupPanelProps {
  backups: BackupRecord[]
  loading: boolean
  busy: boolean
  onCreate: () => void
  onVerify: (id: string) => void
  onPreflight: (id: string) => void
  onDelete: (id: string) => void
}

export function BackupPanel({
  backups,
  loading,
  busy,
  onCreate,
  onVerify,
  onPreflight,
  onDelete,
}: BackupPanelProps) {
  return (
    <section className="governance-panel" aria-label="备份记录">
      <header className="governance-panel__header">
        <div>
          <p className="governance-panel__kicker">LOCAL SNAPSHOTS</p>
          <h2>备份与恢复</h2>
          <p>数据库和附件按同一份清单校验，只有验证通过的快照才能进入恢复预检。</p>
        </div>
        <Button theme="solid" type="primary" loading={busy} onClick={onCreate}>
          立即备份
        </Button>
      </header>

      <div className="governance-backups" aria-busy={loading}>
        {!loading && backups.length === 0 ? (
          <Empty title="还没有本地备份" description="创建第一份经过校验的数据库与附件快照。" />
        ) : null}
        {backups.map((backup) => {
          const protectedBackup = backup.kind === 'PRE_RESTORE' || backup.status === 'RESTORED'
          return (
            <article className="governance-backup" key={backup.id}>
              <div className="governance-backup__stamp" aria-hidden="true">
                <IconShield size="extra-large" />
              </div>
              <div className="governance-backup__main">
                <div className="governance-backup__title">
                  <strong>{new Date(backup.createdAt).toLocaleString('zh-CN')}</strong>
                  <Tag color={backup.status === 'FAILED' ? 'red' : backup.status === 'VERIFIED' ? 'green' : 'blue'}>
                    {STATUS_LABELS[backup.status]}
                  </Tag>
                  <Tag>{KIND_LABELS[backup.kind]}</Tag>
                </div>
                <span>{backup.fileCount} 个文件 · {formatBytes(backup.byteSize)}</span>
                {backup.failureMessage ? <p className="governance-backup__error">{backup.failureMessage}</p> : null}
              </div>
              <div className="governance-backup__actions">
                {backup.status === 'CREATED' ? (
                  <Button icon={<IconRefresh />} onClick={() => onVerify(backup.id)}>验证</Button>
                ) : null}
                {backup.status === 'VERIFIED' ? (
                  <Button onClick={() => onPreflight(backup.id)}>恢复预检</Button>
                ) : null}
                <Button
                  type="danger"
                  icon={<IconDelete />}
                  aria-label={`删除备份 ${backup.id}`}
                  disabled={protectedBackup}
                  onClick={() => onDelete(backup.id)}
                />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
