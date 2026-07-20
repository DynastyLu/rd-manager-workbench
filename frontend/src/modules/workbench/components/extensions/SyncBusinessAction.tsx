import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banner, Button, Modal } from '@douyinfe/semi-ui'
import { IconSync } from '@douyinfe/semi-icons'
import { toast } from 'sonner'

import {
  commitSyncSession,
  getSyncSession,
  listExtensionProfiles,
  prepareSyncSession,
  startSyncPreflight,
  type ExtensionKind,
  type PreparedSyncSession,
  type SyncSession,
  type SyncTarget,
  type SyncResolution,
} from '@/modules/workbench/api/extensions'
import { SyncPreflightDialog } from './SyncPreflightDialog'
import './AiBusinessAction.less'

interface SyncBusinessActionProps {
  kind: Extract<ExtensionKind, 'CALENDAR' | 'CLOUD_DRIVE'>
  buttonLabel: string
  target: SyncTarget
  labels?: Record<string, string>
  onCommitted?: () => void | Promise<void>
}

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

async function waitForSyncSession(sessionId: string, terminal: Array<SyncSession['status']>) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const session = await getSyncSession(sessionId)
    if (terminal.includes(session.status)) return session
    if (session.status === 'FAILED' || session.status === 'EXPIRED') {
      throw new Error(session.errorCode ?? 'EXTERNAL_SYNC_FAILED')
    }
    await delay(1_000)
  }
  throw new Error('EXTERNAL_SYNC_TIMEOUT')
}

function summaryText(prepared: PreparedSyncSession) {
  const summary = prepared.summary
  const text = (value: unknown) => typeof value === 'string' ? value : ''
  if (summary.type === 'CALENDAR') return `读取 ${text(summary.startAt)} 至 ${text(summary.endAt)} 的外部日历元数据。`
  return `${summary.mode === 'DOWNLOAD' ? '检查下载' : '检查上传'}：${text(summary.remotePath)}`
}

export function SyncBusinessAction({ kind, buttonLabel, target, labels = {}, onCommitted }: SyncBusinessActionProps) {
  const [prepared, setPrepared] = useState<PreparedSyncSession | null>(null)
  const [session, setSession] = useState<SyncSession | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, SyncResolution>>({})
  const [preparing, setPreparing] = useState(false)
  const [running, setRunning] = useState(false)
  const [committing, setCommitting] = useState(false)
  const desktopExtensions = window.rdWorkbenchDesktop?.extensions
  const profilesQuery = useQuery({
    queryKey: ['extensions', 'profiles', kind],
    queryFn: () => listExtensionProfiles(kind),
  })
  const profile = useMemo(
    () => profilesQuery.data?.find((item) => item.enabled),
    [profilesQuery.data],
  )

  const begin = async () => {
    if (!profile) return
    setPreparing(true)
    try {
      setPrepared(await prepareSyncSession({ profileId: profile.id, target }))
    } catch {
      toast.error('同步预检准备失败；没有读取或修改外部数据。')
    } finally {
      setPreparing(false)
    }
  }

  const start = async () => {
    if (!prepared) return
    setRunning(true)
    try {
      await startSyncPreflight(prepared.sessionId, { confirmationHash: prepared.confirmationHash })
      setPrepared(null)
      const ready = await waitForSyncSession(prepared.sessionId, ['READY'])
      if (!ready.preflight) throw new Error('EXTERNAL_SYNC_PREFLIGHT_MISSING')
      setSession(ready)
      setResolutions({})
    } catch {
      toast.error('外部同步预检失败；没有修改本地或远端对象。')
    } finally {
      setRunning(false)
    }
  }

  const commit = async () => {
    if (!session?.preflight) return
    setCommitting(true)
    try {
      const result = await commitSyncSession(session.id, {
        preflightHash: session.preflight.preflightHash,
        resolutions: session.preflight.items.map((item) => ({
          itemKey: item.itemKey,
          resolution: resolutions[item.itemKey]!,
        })),
      })
      if (result.status === 'COMMIT_RUNNING') await waitForSyncSession(session.id, ['COMMITTED'])
      setSession(null)
      await onCommitted?.()
      toast.success('外部同步已完成')
    } catch {
      toast.error('同步提交失败；服务端没有留下部分更新。')
    } finally {
      setCommitting(false)
    }
  }

  const preflight = session?.preflight
  const direction = preflight?.direction
    ?? (profile?.publicConfig.syncDirection === 'BIDIRECTIONAL' ? 'BIDIRECTIONAL' : 'PULL_ONLY')

  return (
    <span className="ai-business-action">
      <Button
        icon={<IconSync />}
        aria-label={buttonLabel}
        loading={preparing || running}
        disabled={!desktopExtensions || !profile || preparing || running}
        onClick={() => { void begin() }}
      >
        {buttonLabel}
      </Button>
      {!desktopExtensions ? <small>请在 Electron 桌面端使用外部同步</small> : null}
      {desktopExtensions && !profilesQuery.isPending && !profile ? <small>请先启用外部同步服务</small> : null}

      <Modal
        visible={Boolean(prepared)}
        title="确认外部同步预检"
        onCancel={() => setPrepared(null)}
        footer={(
          <>
            <Button onClick={() => setPrepared(null)}>取消</Button>
            <Button theme="solid" type="primary" loading={running} onClick={() => { void start() }}>确认并开始预检</Button>
          </>
        )}
      >
        <Banner
          type="warning"
          fullMode={false}
          closeIcon={null}
          title={`将连接 ${prepared?.provider ?? '外部服务'}`}
          description={prepared ? summaryText(prepared) : ''}
        />
        <p>预检只读取必要的远端版本与摘要；完整正文不会写入日志。发现变更后仍需逐项选择再提交。</p>
      </Modal>

      <SyncPreflightDialog
        visible={Boolean(preflight)}
        direction={direction}
        items={(preflight?.items ?? []).map((item) => ({
          id: item.itemKey,
          title: (item.localId && labels[item.localId])
            || (typeof item.remotePreview?.title === 'string' ? item.remotePreview.title : undefined)
            || item.remoteId,
          action: item.action,
          allowedResolutions: item.allowedResolutions,
          detail: item.action === 'CONFLICT' ? '本地与远端均有更新' : undefined,
        }))}
        resolutions={resolutions}
        committing={committing}
        onResolutionChange={(id, resolution) => setResolutions((current) => ({ ...current, [id]: resolution }))}
        onCancel={() => setSession(null)}
        onCommit={() => { void commit() }}
      />
    </span>
  )
}
