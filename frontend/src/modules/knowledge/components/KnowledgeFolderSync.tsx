import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Switch, Toast, Tag, Card, Space, Modal, Progress } from '@douyinfe/semi-ui'
import { IconFolder, IconDelete, IconRefresh, IconPlus } from '@douyinfe/semi-icons'
import {
  listFolderWatches,
  startFolderWatch,
  stopFolderWatch,
  rescanFolder,
  getFolderProgressSnapshot,
  retryFailedFolderFiles,
  type FolderSyncProgress,
  type FolderWatchItem,
} from '../api'
import { parseFolderProgressEvent } from '../folder-progress'
import { apiUrl } from '@/lib/api-url'

function useFolderProgress() {
  const [progress, setProgress] = useState<FolderSyncProgress | null>(null)
  const [transport, setTransport] = useState<'realtime' | 'polling'>('realtime')
  const esRef = useRef<EventSource | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = null
  }, [])

  const connect = useCallback(
    async (id: string) => {
      esRef.current?.close()
      clearPolling()
      setTransport('realtime')

      const applyProgress = (data: FolderSyncProgress) => {
        setProgress(data)
        if (data.phase === 'done' || data.phase === 'error') {
          clearPolling()
          esRef.current?.close()
          esRef.current = null
        }
      }

      const poll = () => {
        void getFolderProgressSnapshot(id)
          .then((data) => {
            applyProgress(data)
            if (data.phase !== 'done' && data.phase !== 'error') {
              pollTimerRef.current = setTimeout(poll, 800)
            }
          })
          .catch(() => {
            pollTimerRef.current = setTimeout(poll, 800)
          })
      }
      void getFolderProgressSnapshot(id)
        .then(applyProgress)
        .catch(() => undefined)

      const api = await import('../api')
      const url =
        (await (api.getFolderProgressEventSourceUrl
          ? api.getFolderProgressEventSourceUrl(id).catch(() => undefined)
          : undefined)) ??
        apiUrl(`/knowledge/folders/${encodeURIComponent(String(id))}/progress`)
      const es = new EventSource(url)
      esRef.current = es

      es.onmessage = (event) => {
        try {
          applyProgress(parseFolderProgressEvent(String(event.data)))
        } catch {
          /* ignore parse errors */
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setTransport('polling')
        poll()
      }
    },
    [clearPolling]
  )

  const disconnect = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
    clearPolling()
    setProgress(null)
  }, [clearPolling])

  useEffect(
    () => () => {
      esRef.current?.close()
      clearPolling()
    },
    [clearPolling]
  )

  return { progress, transport, connect, disconnect }
}

const PHASE_LABELS: Record<string, string> = {
  scanning: '正在扫描文件夹...',
  deleting: '正在清理已删除的文件...',
  importing: '正在导入文件...',
  done: '同步完成',
  error: '同步出错',
}

export function KnowledgeFolderSync() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [folderPath, setFolderPath] = useState('')
  const [folderLabel, setFolderLabel] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [activeWatchId, setActiveWatchId] = useState<string | null>(null)
  const { progress, transport, connect, disconnect } = useFolderProgress()

  const { data: folders, isPending } = useQuery({
    queryKey: ['knowledge-folders'],
    queryFn: () => listFolderWatches().then((d) => d as unknown as FolderWatchItem[]),
    refetchInterval: 30_000,
  })

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['knowledge-folders'] })
    void queryClient.invalidateQueries({ queryKey: ['documents'] })
    void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] })
    void queryClient.invalidateQueries({ queryKey: ['knowledge-spaces'] })
  }

  // Auto-refresh when sync completes
  const prevPhase = useRef(progress?.phase)
  useEffect(() => {
    if (progress?.phase === 'done' && prevPhase.current !== 'done') {
      refreshAll()
    }
    prevPhase.current = progress?.phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.phase])

  const startMutation = useMutation({
    mutationFn: (body: { folderPath: string; label?: string; recursive?: boolean }) =>
      startFolderWatch(body),
    onSuccess: (result) => {
      Toast.success('已开始同步')
      const watchId = (result as unknown as { watchId: string }).watchId
      setActiveWatchId(watchId)
      void connect(watchId)
      setModalOpen(false)
      setFolderPath('')
      setFolderLabel('')
    },
    onError: (err: Error) => Toast.error(`添加文件夹失败：${err.message}`),
  })

  const stopMutation = useMutation({
    mutationFn: (id: string) => stopFolderWatch(id),
    onSuccess: () => {
      Toast.success('已停止同步')
      disconnect()
      setActiveWatchId(null)
      refreshAll()
    },
    onError: (err: Error) => Toast.error(err.message),
  })

  const rescanMutation = useMutation({
    mutationFn: (id: string) => rescanFolder(id),
    onSuccess: (_result, id) => {
      setActiveWatchId(id)
      void connect(id)
      refreshAll()
    },
    onError: (err: Error) => Toast.error(err.message),
  })

  const retryFailedMutation = useMutation({
    mutationFn: (id: string) => retryFailedFolderFiles(id),
    onSuccess: (_result, id) => {
      setActiveWatchId(id)
      void connect(id)
    },
    onError: (err: Error) => Toast.error(`重试失败：${err.message}`),
  })

  useEffect(() => {
    if (activeWatchId || !folders) return
    const active = folders.find((folder) => folder.status === 'ACTIVE')
    if (!active) return
    setActiveWatchId(active.id)
    void connect(active.id)
  }, [activeWatchId, connect, folders])

  return (
    <div className="kb-folder-sync">
      <div className="kb-folder-sync__header">
        <h3>
          <IconFolder /> 本地文件夹同步
        </h3>
        <Button icon={<IconPlus />} onClick={() => setModalOpen(true)}>
          添加文件夹
        </Button>
      </div>

      <p className="kb-folder-sync__desc">
        将电脑上的文件夹关联到知识库空间，文件变化会自动同步。支持 .txt .md .docx .pdf .html .xlsx
        .csv .json（DOCX/PDF/XLSX 自动提取文本）
      </p>

      {isPending ? <p>加载中...</p> : null}

      {/* Progress bar */}
      {progress && (
        <Card className="kb-folder-sync__progress" bodyStyle={{ padding: '12px 16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {PHASE_LABELS[progress.phase] || progress.phase}
            </span>
            {progress.phase === 'scanning' ? (
              <span style={{ fontSize: 12, color: '#8f959e' }}>
                已扫描 {progress.scanned ?? progress.current} 个文件
              </span>
            ) : progress.total > 0 ? (
              <span style={{ fontSize: 12, color: '#8f959e' }}>
                {progress.current} / {progress.total} 个文件
              </span>
            ) : null}
          </div>
          {progress.phase === 'scanning' && progress.total === 0 ? (
            <div
              className="kb-folder-sync__scanning-progress"
              role="progressbar"
              aria-label="正在发现文件，总数未知"
              aria-busy="true"
            >
              <span />
            </div>
          ) : (
            <Progress
              aria-label={`文件处理进度 ${progress.percent}%`}
              percent={progress.percent}
              strokeWidth={8}
            />
          )}
          {transport === 'polling' && progress.phase !== 'done' && progress.phase !== 'error' ? (
            <div className="kb-folder-sync__transport-warning">
              实时连接已中断，正在使用轮询补偿
            </div>
          ) : null}
          {progress.currentFile && (
            <div
              style={{
                fontSize: 12,
                color: '#8f959e',
                marginTop: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {progress.currentFile}
            </div>
          )}
          {progress.result && progress.phase === 'done' && (
            <div style={{ fontSize: 12, color: '#52c41a', marginTop: 4 }}>
              扫描 {progress.result.scanned} · 导入 {progress.result.imported} · 更新{' '}
              {progress.result.updated} · 删除 {progress.result.deleted}
              {progress.result.errors ? ` · 失败 ${progress.result.errors}` : ''}
            </div>
          )}
          {progress.counts ? (
            <div className="kb-folder-sync__counts">
              发现 {progress.counts.discovered} · 待处理 {progress.counts.pending} · 成功{' '}
              {progress.counts.success} · 更新 {progress.counts.updated} · 跳过{' '}
              {progress.counts.skipped} · 删除 {progress.counts.deleted} · 失败{' '}
              {progress.counts.failed}
            </div>
          ) : null}
          {(progress.failedFiles?.length ?? 0) > 0 ? (
            <details className="kb-folder-sync__failures">
              <summary>失败文件（{progress.failedFiles?.length ?? 0}）</summary>
              <ul>
                {progress.failedFiles?.map((failure) => (
                  <li key={`${failure.fileName}:${failure.category}`}>
                    <strong>{failure.fileName}</strong>
                    <span>{failure.reason}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="small"
                loading={retryFailedMutation.isPending}
                onClick={() => progress.watchId && retryFailedMutation.mutate(progress.watchId)}
              >
                只重试失败项
              </Button>
            </details>
          ) : null}
          {progress.error && (
            <div style={{ fontSize: 12, color: '#e74c3c', marginTop: 4 }}>{progress.error}</div>
          )}
        </Card>
      )}

      {folders && folders.length > 0 ? (
        <Space vertical style={{ width: '100%' }}>
          {folders.map((f) => (
            <Card key={f.id} className="kb-folder-sync__card" bodyStyle={{ padding: '12px 16px' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <strong>{f.label}</strong>
                  <Tag
                    size="small"
                    type={f.status === 'ACTIVE' ? 'solid' : 'ghost'}
                    color={
                      f.status === 'ACTIVE' ? 'green' : f.status === 'ERROR' ? 'red' : 'orange'
                    }
                  >
                    {f.status === 'ACTIVE' ? '监听中' : f.status === 'ERROR' ? '错误' : '已暂停'}
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: '#8f959e', marginBottom: 4 }}>
                  {f.folderPath}
                </div>
                <div style={{ fontSize: 12, color: '#8f959e', display: 'flex', gap: 16 }}>
                  <span>空间：{f.space?.name}</span>
                  <span>文件数：{f._count?.files ?? 0}</span>
                  {f.lastSyncAt && <span>上次同步：{new Date(f.lastSyncAt).toLocaleString()}</span>}
                </div>
                {f.errorMessage && (
                  <div style={{ fontSize: 12, color: '#e74c3c', marginTop: 4 }}>
                    {f.errorMessage}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <Button
                  size="small"
                  icon={<IconRefresh />}
                  loading={
                    (rescanMutation.isPending && rescanMutation.variables === f.id) ||
                    (activeWatchId === f.id &&
                      progress?.phase !== 'done' &&
                      progress?.phase !== 'error')
                  }
                  onClick={() => {
                  rescanMutation.mutate(f.id)
                }}
                >
                  {f.status === 'ACTIVE' ? '重新扫描' : '恢复并扫描'}
                </Button>
                <Button
                  size="small"
                  icon={<IconDelete />}
                  type="danger"
                  onClick={() => stopMutation.mutate(f.id)}
                >
                  停止
                </Button>
              </div>
            </Card>
          ))}
        </Space>
      ) : (
        !isPending && (
          <p style={{ color: '#8f959e' }}>暂无关联的本地文件夹，点击"添加文件夹"开始。</p>
        )
      )}

      <Modal
        title="添加本地文件夹"
        visible={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => {
          if (!folderPath.trim()) {
            Toast.warning('请输入文件夹路径')
            return
          }
          startMutation.mutate({
            folderPath: folderPath.trim(),
            label: folderLabel.trim() || undefined,
            recursive,
          })
        }}
        okButtonProps={{ loading: startMutation.isPending }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div>
            <label
              htmlFor="kb-folder-path"
              style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
            >
              文件夹路径（必填）
            </label>
            <Input
              id="kb-folder-path"
              placeholder="/Users/dynastylu/Desktop/我的文档"
              value={folderPath}
              onChange={(v) => setFolderPath(v)}
            />
          </div>
          <div>
            <label
              htmlFor="kb-folder-label"
              style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
            >
              显示名称（可选，默认使用文件夹名）
            </label>
            <Input
              id="kb-folder-label"
              placeholder="我的文档"
              value={folderLabel}
              onChange={(v) => setFolderLabel(v)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="kb-folder-recursive" style={{ fontSize: 13 }}>
              包含子文件夹
            </label>
            <Switch
              id="kb-folder-recursive"
              checked={recursive}
              onChange={(v) => setRecursive(v)}
            />
          </div>
          <p style={{ fontSize: 12, color: '#8f959e' }}>
            系统会自动创建同名知识空间，并把所有支持的文件导入进去。DOCX/PDF/XLSX
            会自动提取文本内容。之后文件有变化会自动同步。
          </p>
        </div>
      </Modal>

      <style>{`
        .kb-folder-sync { padding: 16px 0; }
        .kb-folder-sync__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .kb-folder-sync__desc { font-size: 13px; color: #8f959e; margin-bottom: 16px; }
        .kb-folder-sync__card { margin-bottom: 8px; }
        .kb-folder-sync__progress { margin-bottom: 16px; border: 1px solid #b7eb8f; background: #f6ffed; }
        .kb-folder-sync__scanning-progress .semi-progress-track-inner {
          animation: kb-folder-scanning 1.2s ease-in-out infinite alternate;
        }
        @keyframes kb-folder-scanning {
          from { transform: translateX(-85%); }
          to { transform: translateX(185%); }
        }
      `}</style>
    </div>
  )
}
