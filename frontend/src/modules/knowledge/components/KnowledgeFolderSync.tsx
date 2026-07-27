import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Switch, Toast, Tag, Card, Space, Modal, Progress } from '@douyinfe/semi-ui';
import { IconFolder, IconDelete, IconRefresh, IconPlus } from '@douyinfe/semi-icons';
import {
  listFolderWatches, startFolderWatch, stopFolderWatch, rescanFolder,
  type FolderWatchItem,
} from '../api';

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:4311/api' : '';

interface SyncProgress {
  watchId: string;
  phase: 'scanning' | 'deleting' | 'importing' | 'done' | 'error';
  total: number;
  current: number;
  currentFile: string;
  percent: number;
  result?: { imported: number; updated: number; deleted: number; errors: number };
  error?: string;
}

function useFolderProgress(watchId: string | null) {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback((id: string) => {
    // Close previous connection
    esRef.current?.close();
    const es = new EventSource(`${API_BASE}/knowledge/folders/${encodeURIComponent(String(id))}/progress`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const raw = JSON.parse(String(event.data)) as unknown;
        const data = raw as SyncProgress;
        setProgress(data);
        if (data.phase === 'done' || data.phase === 'error') {
          es.close();
          esRef.current = null;
          // Keep the done state visible for 3 seconds
          setTimeout(() => setProgress(null), 3000);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Fallback to polling
    };
  }, []);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setProgress(null);
  }, []);

  useEffect(() => {
    if (watchId) connect(watchId);
    return () => { esRef.current?.close(); };
  }, [watchId, connect]);

  return { progress, connect, disconnect };
}

const PHASE_LABELS: Record<string, string> = {
  scanning: '正在扫描文件夹...',
  deleting: '正在清理已删除的文件...',
  importing: '正在导入文件...',
  done: '同步完成',
  error: '同步出错',
};

export function KnowledgeFolderSync() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [folderLabel, setFolderLabel] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [activeWatchId, setActiveWatchId] = useState<string | null>(null);
  const { progress, disconnect } = useFolderProgress(activeWatchId);

  const { data: folders, isPending } = useQuery({
    queryKey: ['knowledge-folders'],
    queryFn: () => listFolderWatches().then((d) => d as unknown as FolderWatchItem[]),
    refetchInterval: 30_000,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['knowledge-folders'] });
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
    void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] });
    void queryClient.invalidateQueries({ queryKey: ['knowledge-spaces'] });
  };

  // Auto-refresh when sync completes
  const prevPhase = useRef(progress?.phase);
  useEffect(() => {
    if (progress?.phase === 'done' && prevPhase.current !== 'done') {
      refreshAll();
    }
    prevPhase.current = progress?.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.phase]);

  const startMutation = useMutation({
    mutationFn: (body: { folderPath: string; label?: string; recursive?: boolean }) => startFolderWatch(body),
    onSuccess: (result) => {
      Toast.success('已开始同步');
      setActiveWatchId((result as unknown as { watchId: string }).watchId);
      setModalOpen(false);
      setFolderPath('');
      setFolderLabel('');
    },
    onError: (err: Error) => Toast.error(`添加文件夹失败：${err.message}`),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => stopFolderWatch(id),
    onSuccess: () => {
      Toast.success('已停止同步');
      disconnect();
      setActiveWatchId(null);
      refreshAll();
    },
    onError: (err: Error) => Toast.error(err.message),
  });

  const rescanMutation = useMutation({
    mutationFn: (id: string) => {
      setActiveWatchId(id);
      // Delay rescan slightly so the SSE connection can be established first
      return new Promise((resolve) => setTimeout(resolve, 200)).then(() => rescanFolder(id));
    },
    onSuccess: () => {
      refreshAll();
    },
    onError: (err: Error) => Toast.error(err.message),
  });

  return (
    <div className="kb-folder-sync">
      <div className="kb-folder-sync__header">
        <h3><IconFolder /> 本地文件夹同步</h3>
        <Button icon={<IconPlus />} onClick={() => setModalOpen(true)}>添加文件夹</Button>
      </div>

      <p className="kb-folder-sync__desc">
        将电脑上的文件夹关联到知识库空间，文件变化会自动同步。支持 .txt .md .docx .pdf .html .xlsx .csv .json（DOCX/PDF/XLSX 自动提取文本）
      </p>

      {isPending ? <p>加载中...</p> : null}

      {/* Progress bar */}
      {progress && (
        <Card className="kb-folder-sync__progress" bodyStyle={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {PHASE_LABELS[progress.phase] || progress.phase}
            </span>
            {progress.total > 0 && (
              <span style={{ fontSize: 12, color: '#8f959e' }}>
                {progress.current} / {progress.total} 个文件
              </span>
            )}
          </div>
          <Progress percent={progress.percent} strokeWidth={8} />
          {progress.currentFile && (
            <div style={{ fontSize: 12, color: '#8f959e', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {progress.currentFile}
            </div>
          )}
          {progress.result && progress.phase === 'done' && (
            <div style={{ fontSize: 12, color: '#52c41a', marginTop: 4 }}>
              导入 {progress.result.imported} · 更新 {progress.result.updated} · 删除 {progress.result.deleted}
              {progress.result.errors ? ` · 失败 ${progress.result.errors}` : ''}
            </div>
          )}
          {progress.error && (
            <div style={{ fontSize: 12, color: '#e74c3c', marginTop: 4 }}>{progress.error}</div>
          )}
        </Card>
      )}

      {(folders && folders.length > 0) ? (
        <Space vertical style={{ width: '100%' }}>
          {folders.map((f) => (
            <Card key={f.id} className="kb-folder-sync__card" bodyStyle={{ padding: '12px 16px' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <strong>{f.label}</strong>
                  <Tag size="small" type={f.status === 'ACTIVE' ? 'solid' : 'ghost'}
                    color={f.status === 'ACTIVE' ? 'green' : f.status === 'ERROR' ? 'red' : 'orange'}>
                    {f.status === 'ACTIVE' ? '监听中' : f.status === 'ERROR' ? '错误' : '已暂停'}
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: '#8f959e', marginBottom: 4 }}>{f.folderPath}</div>
                <div style={{ fontSize: 12, color: '#8f959e', display: 'flex', gap: 16 }}>
                  <span>空间：{f.space?.name}</span>
                  <span>文件数：{f._count?.files ?? 0}</span>
                  {f.lastSyncAt && <span>上次同步：{new Date(f.lastSyncAt).toLocaleString()}</span>}
                </div>
                {f.errorMessage && <div style={{ fontSize: 12, color: '#e74c3c', marginTop: 4 }}>{f.errorMessage}</div>}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <Button size="small" icon={<IconRefresh />}
                  loading={activeWatchId === f.id && progress?.phase !== 'done' && progress?.phase !== 'error'}
                  onClick={() => rescanMutation.mutate(f.id)}>重新扫描</Button>
                <Button size="small" icon={<IconDelete />} type="danger"
                  onClick={() => stopMutation.mutate(f.id)}>停止</Button>
              </div>
            </Card>
          ))}
        </Space>
      ) : (
        !isPending && <p style={{ color: '#8f959e' }}>暂无关联的本地文件夹，点击"添加文件夹"开始。</p>
      )}

      <Modal
        title="添加本地文件夹"
        visible={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => {
          if (!folderPath.trim()) { Toast.warning('请输入文件夹路径'); return; }
          startMutation.mutate({ folderPath: folderPath.trim(), label: folderLabel.trim() || undefined, recursive });
        }}
        okButtonProps={{ loading: startMutation.isPending }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div>
            <label htmlFor="kb-folder-path" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>文件夹路径（必填）</label>
            <Input
              id="kb-folder-path"
              placeholder="/Users/dynastylu/Desktop/我的文档"
              value={folderPath}
              onChange={(v) => setFolderPath(v)}
            />
          </div>
          <div>
            <label htmlFor="kb-folder-label" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>显示名称（可选，默认使用文件夹名）</label>
            <Input
              id="kb-folder-label"
              placeholder="我的文档"
              value={folderLabel}
              onChange={(v) => setFolderLabel(v)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="kb-folder-recursive" style={{ fontSize: 13 }}>包含子文件夹</label>
            <Switch id="kb-folder-recursive" checked={recursive} onChange={(v) => setRecursive(v)} />
          </div>
          <p style={{ fontSize: 12, color: '#8f959e' }}>
            系统会自动创建同名知识空间，并把所有支持的文件导入进去。DOCX/PDF/XLSX 会自动提取文本内容。之后文件有变化会自动同步。
          </p>
        </div>
      </Modal>

      <style>{`
        .kb-folder-sync { padding: 16px 0; }
        .kb-folder-sync__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .kb-folder-sync__desc { font-size: 13px; color: #8f959e; margin-bottom: 16px; }
        .kb-folder-sync__card { margin-bottom: 8px; }
        .kb-folder-sync__progress { margin-bottom: 16px; border: 1px solid #b7eb8f; background: #f6ffed; }
      `}</style>
    </div>
  );
}
