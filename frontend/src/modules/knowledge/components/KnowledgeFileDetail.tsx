import { Skeleton, Button, Space } from '@douyinfe/semi-ui';
import { IconFile, IconDownload, IconEdit, IconDelete } from '@douyinfe/semi-icons';

export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  version: number;
  date: string;
  status: 'ACTIVE' | 'TRASHED';
  spaceId?: string;
  spaceName?: string;
}

export interface SpaceOption {
  id: string;
  name: string;
}

export interface KnowledgeFileDetailProps {
  file: FileItem | null;
  loading?: boolean;
  onDownload?: (file: FileItem) => void;
  onRename?: (file: FileItem, newName: string) => void;
  onDelete?: (file: FileItem) => void;
  onRestore?: (file: FileItem) => void;
  onPermanentDelete?: (file: FileItem) => void;
  onConvertToDocument?: (file: FileItem) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const metaLabels: Record<string, string> = {
  name: '文件名称',
  type: '文件类型',
  size: '文件大小',
  version: '版本号',
  date: '修改日期',
  spaceName: '所属空间',
};

export function KnowledgeFileDetail({
  file,
  loading,
  onDownload,
  onRename,
  onDelete,
  onRestore,
  onPermanentDelete,
  onConvertToDocument,
}: KnowledgeFileDetailProps) {
  if (loading) {
    return (
      <div className="kb-file-detail">
        <div className="kb-file-detail__header">
          <Skeleton.Title style={{ width: '60%' }} />
        </div>
        <div className="kb-file-detail__meta">
          <Skeleton placeholder={<Skeleton.Paragraph rows={6} />} loading={true} />
        </div>
        <div className="kb-file-detail__actions">
          <Skeleton placeholder={<Skeleton.Button />} loading={true} />
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="kb-file-detail">
        <div className="kb-file-detail__empty">请选择一个文件查看详情</div>
      </div>
    );
  }

  const handleRename = () => {
    const newName = window.prompt('请输入新文件名', file.name);
    if (newName && newName.trim() && newName.trim() !== file.name) {
      onRename?.(file, newName.trim());
    }
  };

  const metaPairs: [string, string][] = [
    ['name', file.name],
    ['type', file.type],
    ['size', formatFileSize(file.size)],
    ['version', `v${file.version}`],
    ['date', new Date(file.date).toLocaleString('zh-CN')],
  ];

  if (file.spaceName) {
    metaPairs.push(['spaceName', file.spaceName]);
  }

  return (
    <div className="kb-file-detail">
      <div className="kb-file-detail__header">
        <IconFile size="large" />
        <h3>{file.name}</h3>
      </div>

      <div className="kb-file-detail__meta">
        {metaPairs.map(([key, value]) => (
          <div key={key} className="kb-file-detail__meta-item">
            <span className="kb-file-detail__meta-label">{metaLabels[key]}</span>
            <span className="kb-file-detail__meta-value">{value}</span>
          </div>
        ))}
      </div>

      <div className="kb-file-detail__actions">
        <Space wrap>
          <Button icon={<IconDownload />} onClick={() => onDownload?.(file)}>
            下载
          </Button>
          <Button icon={<IconEdit />} onClick={handleRename}>
            重命名
          </Button>
          {file.status === 'ACTIVE' ? (
            <>
              <Button icon={<IconFile />} onClick={() => onConvertToDocument?.(file)}>
                转为文档
              </Button>
              <Button
                icon={<IconDelete />}
                type="danger"
                onClick={() => onDelete?.(file)}
              >
                移入回收站
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => onRestore?.(file)}>恢复</Button>
              <Button type="danger" onClick={() => onPermanentDelete?.(file)}>
                永久删除
              </Button>
            </>
          )}
        </Space>
      </div>

      <style>{`
        .kb-file-detail {
          padding: 16px;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .kb-file-detail__header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }
        .kb-file-detail__header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .kb-file-detail__meta {
          flex: 1;
          margin-bottom: 16px;
        }
        .kb-file-detail__meta-item {
          display: flex;
          padding: 8px 0;
          border-bottom: 1px solid var(--semi-color-border, #e8e8e8);
        }
        .kb-file-detail__meta-label {
          flex-shrink: 0;
          width: 80px;
          color: var(--semi-color-text-2, #999);
          font-size: 13px;
        }
        .kb-file-detail__meta-value {
          flex: 1;
          color: var(--semi-color-text-0, #1f1f1f);
          font-size: 13px;
          word-break: break-all;
        }
        .kb-file-detail__actions {
          padding-top: 8px;
          border-top: 1px solid var(--semi-color-border, #e8e8e8);
        }
        .kb-file-detail__empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--semi-color-text-2, #999);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
