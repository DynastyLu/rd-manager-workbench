import { useState } from 'react'
import { Banner, Button, Input } from '@douyinfe/semi-ui'

import type { RestorePreflight } from '@/modules/workbench/api/governance'

const CONFIRMATION_TEXT = '恢复本地工作台'

export interface RestorePreflightDialogProps {
  preflight: RestorePreflight | null
  restoring: boolean
  onClose: () => void
  onRestore: (preflight: RestorePreflight) => void
}

export function RestorePreflightDialog({
  preflight,
  restoring,
  onClose,
  onRestore,
}: RestorePreflightDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  if (!preflight) return null

  return (
    <div className="governance-dialog-backdrop">
      <section className="governance-dialog" role="dialog" aria-modal="true" aria-label="恢复本地工作台">
        <div className="governance-dialog__step">恢复预检 · 2 / 3</div>
        <h2>恢复本地工作台</h2>
        <p>预检有效至 {new Date(preflight.expiresAt).toLocaleTimeString('zh-CN')}。恢复期间本地服务会短暂停止。</p>
        {preflight.warnings.map((warning) => (
          <Banner key={warning} type="warning" title={warning} closeIcon={null} />
        ))}
        <dl className="governance-dialog__summary">
          <div><dt>附件数量</dt><dd>{String(preflight.summary.fileCount ?? '—')}</dd></div>
          <div><dt>快照大小</dt><dd>{String(preflight.summary.byteSize ?? '—')} B</dd></div>
          <div><dt>清单指纹</dt><dd>{preflight.manifestSha256.slice(0, 12)}</dd></div>
        </dl>
        <label className="governance-dialog__confirm">
          <span>输入“{CONFIRMATION_TEXT}”继续</span>
          <Input
            aria-label="输入确认文字"
            value={confirmation}
            onChange={setConfirmation}
            placeholder={CONFIRMATION_TEXT}
          />
        </label>
        {!window.rdWorkbenchDesktop?.restoreBackup ? (
          <p className="governance-dialog__browser-note">浏览器模式只能完成预检；请在 Electron 桌面端执行恢复。</p>
        ) : null}
        <footer>
          <Button onClick={onClose}>取消</Button>
          <Button
            theme="solid"
            type="danger"
            loading={restoring}
            disabled={confirmation !== CONFIRMATION_TEXT || !window.rdWorkbenchDesktop?.restoreBackup}
            onClick={() => onRestore(preflight)}
          >
            确认恢复
          </Button>
        </footer>
      </section>
    </div>
  )
}
