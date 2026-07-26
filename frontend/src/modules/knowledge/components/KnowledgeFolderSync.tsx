import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Switch, Toast, Tag, Card, Space, Modal } from '@douyinfe/semi-ui';
import { IconFolder, IconDelete, IconRefresh, IconPlus } from '@douyinfe/semi-icons';
import {
  listFolderWatches, startFolderWatch, stopFolderWatch, rescanFolder,
  type FolderWatchItem,
} from '../api';

export function KnowledgeFolderSync() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [folderLabel, setFolderLabel] = useState('');
  const [recursive, setRecursive] = useState(true);

  const { data: folders, isPending } = useQuery({
    queryKey: ['knowledge-folders'],
    queryFn: () => listFolderWatches().then((d) => d as unknown as FolderWatchItem[]),
    refetchInterval: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: (body: { folderPath: string; label?: string; recursive?: boolean }) => startFolderWatch(body),
    onSuccess: (result) => {
      Toast.success(`已开始同步：${result.spaceId ? '已创建知识空间' : ''}`);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-folders'] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-spaces'] });
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
      void queryClient.invalidateQueries({ queryKey: ['knowledge-folders'] });
    },
    onError: (err: Error) => Toast.error(err.message),
  });

  const rescanMutation = useMutation({
    mutationFn: (id: string) => rescanFolder(id),
    onSuccess: (result) => {
      const r = result as unknown as { imported: number; updated: number; deleted: number; errors: number };
      Toast.success(`已导入 ${r.imported} | 更新 ${r.updated} | 删除 ${r.deleted}${r.errors ? ` | 错误 ${r.errors}` : ''}`);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-folders'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] });
    },
    onError: (err: Error) => Toast.error(err.message),
  });

  const statusColor = (s: string) => (s === 'ACTIVE' ? 'green' : s === 'ERROR' ? 'red' : 'orange');

  return (
    <div className="kb-folder-sync">
      <div className="kb-folder-sync__header">
        <h3><IconFolder /> 本地文件夹同步</h3>
        <Button icon={<IconPlus />} onClick={() => setModalOpen(true)}>添加文件夹</Button>
      </div>

      <p className="kb-folder-sync__desc">
        将电脑上的文件夹关联到知识库空间，文件变化会自动同步。支持 .txt .md .docx .pdf .html .xlsx .csv .json
      </p>

      {isPending ? <p>加载中...</p> : null}

      {(folders && folders.length > 0) ? (
        <Space vertical style={{ width: '100%' }}>
          {folders.map((f) => (
            <Card key={f.id} className="kb-folder-sync__card" bodyStyle={{ padding: '12px 16px' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <strong>{f.label}</strong>
                  <Tag size="small" style={{ color: statusColor(f.status) }}>
                    {f.status === 'ACTIVE' ? '同步中' : f.status === 'ERROR' ? '错误' : '已暂停'}
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
                <Button size="small" icon={<IconRefresh />} loading={rescanMutation.isPending}
                  onClick={() => rescanMutation.mutate(f.id)}>重新扫描</Button>
                <Button size="small" icon={<IconDelete />} type="danger"
                  onClick={() => stopMutation.mutate(f.id)}>停止</Button>
              </div>
            </Card>
          ))}
        </Space>
      ) : (
        <p style={{ color: '#8f959e' }}>暂无关联的本地文件夹，点击"添加文件夹"开始。</p>
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
            系统会自动创建同名知识空间，并把所有支持的文件导入进去。之后文件有变化会自动同步。
          </p>
        </div>
      </Modal>

      <style>{`
        .kb-folder-sync { padding: 16px 0; }
        .kb-folder-sync__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .kb-folder-sync__desc { font-size: 13px; color: #8f959e; margin-bottom: 16px; }
        .kb-folder-sync__card { margin-bottom: 8px; }
      `}</style>
    </div>
  );
}
