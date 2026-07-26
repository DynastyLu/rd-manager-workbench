import { useState } from 'react';
import { Table, Button, Skeleton, Space, Toast } from '@douyinfe/semi-ui';
import { IconUpload, IconDownload, IconDelete, IconUndo, IconFolder, IconFile } from '@douyinfe/semi-icons';
import { KnowledgeFileDetail } from './KnowledgeFileDetail';
import type { FileItem, SpaceOption } from './KnowledgeFileDetail';

interface Props {
  files?: FileItem[];
  spaces?: SpaceOption[];
  isLoading?: boolean;
  selectedSpaceId?: string;
  viewMode?: 'all' | 'trash';
  onSelectSpace?: (spaceId?: string) => void;
  onSelectFile?: (file: FileItem) => void;
  onDownload?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onRestore?: (file: FileItem) => void;
  onPermanentDelete?: (file: FileItem) => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchRestore?: (ids: string[]) => void;
  onUploadClick?: () => void;
  selectedFile?: FileItem | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === 0) return '-';
  return name.slice(idx + 1).toLowerCase();
}

export function KnowledgeFileBrowser({
  files = [],
  spaces = [],
  isLoading = false,
  selectedSpaceId,
  viewMode = 'all',
  onSelectSpace,
  onSelectFile,
  onDownload,
  onDelete,
  onRestore,
  onPermanentDelete,
  onBatchDelete,
  onBatchRestore,
  onUploadClick,
  selectedFile,
}: Props) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const isTrash = viewMode === 'trash';

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 250,
      render: (_: string, record: FileItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconFile />
          <span>{record.name}</span>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (_: string, record: FileItem) => record.type || getFileExtension(record.name),
    },
    {
      title: '大小',
      dataIndex: 'size',
      width: 100,
      render: (_: string, record: FileItem) => formatFileSize(record.size),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 80,
      render: (_: string, record: FileItem) => `v${record.version}`,
    },
    {
      title: '日期',
      dataIndex: 'date',
      width: 180,
      render: (_: string, record: FileItem) => new Date(record.date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 200,
      render: (_: string, record: FileItem) => {
        if (record.status === 'TRASHED') {
          return (
            <Space>
              <Button
                size="small"
                type="tertiary"
                icon={<IconUndo />}
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore?.(record);
                }}
              >
                恢复
              </Button>
              <Button
                size="small"
                type="danger"
                icon={<IconDelete />}
                onClick={(e) => {
                  e.stopPropagation();
                  onPermanentDelete?.(record);
                }}
              >
                永久删除
              </Button>
            </Space>
          );
        }
        return (
          <Space>
            <Button
              size="small"
              type="tertiary"
              icon={<IconDownload />}
              onClick={(e) => {
                e.stopPropagation();
                onDownload?.(record);
              }}
            >
              下载
            </Button>
            <Button
              size="small"
              type="danger"
              icon={<IconDelete />}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(record);
              }}
            >
              删除
            </Button>
          </Space>
        );
      },
    },
  ];

  const handleRowClick = (record: FileItem) => {
    onSelectFile?.(record);
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      Toast.warning('请先选择文件');
      return;
    }
    onBatchDelete?.(selectedRowKeys);
    setSelectedRowKeys([]);
  };

  const handleBatchRestore = () => {
    if (selectedRowKeys.length === 0) {
      Toast.warning('请先选择文件');
      return;
    }
    onBatchRestore?.(selectedRowKeys);
    setSelectedRowKeys([]);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: (string | number)[] | undefined) => {
      setSelectedRowKeys((keys ?? []) as string[]);
    },
  };

  return (
    <div className="kb-file-browser">
      <style>{`
        .kb-file-browser {
          display: grid;
          grid-template-columns: 200px 1fr 320px;
          height: 100%;
          gap: 0;
          background: var(--semi-color-bg-0, #fff);
        }
        .kb-file-browser__sidebar {
          border-right: 1px solid var(--semi-color-border, #e8e8e8);
          padding: 16px;
          overflow-y: auto;
          background: var(--semi-color-bg-1, #fafafa);
        }
        .kb-file-browser__sidebar-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 12px 0;
          color: var(--semi-color-text-0, #1c1f23);
        }
        .kb-file-browser__space-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 14px;
          color: var(--semi-color-text-1, #3c3f45);
        }
        .kb-file-browser__space-item:hover {
          background: var(--semi-color-fill-0, #f5f5f5);
        }
        .kb-file-browser__space-item--active {
          background: var(--semi-color-primary-light-default, #e6f0ff);
          color: var(--semi-color-primary, #0068fa);
          font-weight: 500;
        }
        .kb-file-browser__space-item--trash {
          margin-top: 16px;
          border-top: 1px solid var(--semi-color-border, #e8e8e8);
          padding-top: 16px;
        }
        .kb-file-browser__main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .kb-file-browser__toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--semi-color-border, #e8e8e8);
          gap: 12px;
          flex-wrap: wrap;
        }
        .kb-file-browser__toolbar-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kb-file-browser__toolbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kb-file-browser__table {
          flex: 1;
          overflow: auto;
          padding: 0;
        }
        .kb-file-browser__table .semi-table-row {
          cursor: pointer;
        }
        .kb-file-browser__detail {
          border-left: 1px solid var(--semi-color-border, #e8e8e8);
          padding: 16px;
          overflow-y: auto;
          background: var(--semi-color-bg-0, #fff);
        }
        .kb-file-browser__empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--semi-color-text-2, #999);
          font-size: 14px;
        }
      `}</style>

      {/* Left Sidebar - Space Tree */}
      <div className="kb-file-browser__sidebar">
        <h3 className="kb-file-browser__sidebar-title">知识空间</h3>
        <div
          className={`kb-file-browser__space-item${!selectedSpaceId ? ' kb-file-browser__space-item--active' : ''}`}
          onClick={() => onSelectSpace?.(undefined)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectSpace?.(undefined);
            }
          }}
        >
          <IconFolder />
          <span>全部文件</span>
        </div>
        {spaces.map((space) => (
          <div
            key={space.id}
            className={`kb-file-browser__space-item${selectedSpaceId === space.id ? ' kb-file-browser__space-item--active' : ''}`}
            onClick={() => onSelectSpace?.(space.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSpace?.(space.id);
              }
            }}
          >
            <IconFolder />
            <span>{space.name}</span>
          </div>
        ))}
        <div
          className={`kb-file-browser__space-item kb-file-browser__space-item--trash${isTrash ? ' kb-file-browser__space-item--active' : ''}`}
        >
          <IconDelete />
          <span>回收站</span>
        </div>
      </div>

      {/* Center - File Table */}
      <div className="kb-file-browser__main">
        {/* Toolbar */}
        <div className="kb-file-browser__toolbar">
          <div className="kb-file-browser__toolbar-left">
            <Button
              type={!isTrash ? 'primary' : 'tertiary'}
            >
              全部文件
            </Button>
            <Button
              type={isTrash ? 'primary' : 'tertiary'}
            >
              回收站
            </Button>
            {selectedRowKeys.length > 0 && (
              <Space>
                {!isTrash && (
                  <Button type="danger" onClick={handleBatchDelete}>
                    批量删除
                  </Button>
                )}
                {isTrash && (
                  <Button type="primary" onClick={handleBatchRestore}>
                    批量恢复
                  </Button>
                )}
              </Space>
            )}
          </div>
          <div className="kb-file-browser__toolbar-right">
            <Button icon={<IconUpload />} theme="solid" onClick={() => onUploadClick?.()}>
              上传文件
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="kb-file-browser__table">
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <Skeleton placeholder={<Skeleton.Paragraph rows={6} />} loading={true} />
            </div>
          ) : files.length === 0 ? (
            <div className="kb-file-browser__empty">暂无文件</div>
          ) : (
            <Table
              columns={columns}
              dataSource={files}
              rowKey="id"
              rowSelection={rowSelection}
              onRow={(record: FileItem | undefined) => ({
                onClick: () => {
                  if (record) handleRowClick(record);
                },
                style: {
                  background: selectedFile?.id === record?.id
                    ? 'var(--semi-color-primary-light-default, #e6f0ff)'
                    : undefined,
                },
              })}
              pagination={false}
            />
          )}
        </div>
      </div>

      {/* Right - Detail Panel */}
      <div className="kb-file-browser__detail">
        <KnowledgeFileDetail
          file={selectedFile ?? null}
          loading={isLoading}
          onDownload={onDownload}
          onDelete={onDelete}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
        />
      </div>
    </div>
  );
}

export type { FileItem, SpaceOption };
