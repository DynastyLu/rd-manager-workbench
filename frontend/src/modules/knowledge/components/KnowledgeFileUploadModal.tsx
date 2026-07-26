import { useState, useRef, useCallback } from 'react';
import { Modal, Button, Select, Progress, Toast, Space } from '@douyinfe/semi-ui';
import { IconUpload, IconDelete } from '@douyinfe/semi-icons';

export interface UploadFile {
  id: string;
  name: string;
  size: number;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export interface SpaceOption {
  id: string;
  name: string;
}

const SUPPORTED_FORMATS = ['.txt', '.md', '.docx', '.pdf', '.html', '.htm', '.xlsx', '.xls', '.csv', '.json'];
const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/json',
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_FILES = 10;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `file-${Date.now()}-${idCounter}`;
}

interface FileItem {
  uploadFile: UploadFile;
  rawFile: File;
}

function isValidFile(file: File): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return SUPPORTED_FORMATS.includes(ext) || SUPPORTED_MIME_TYPES.includes(file.type);
}

interface Props {
  visible: boolean;
  onCancel: () => void;
  onUpload: (files: File[], spaceId?: string) => void;
  spaces?: SpaceOption[];
  uploading?: boolean;
}

export function KnowledgeFileUploadModal({ visible, onCancel, onUpload, spaces, uploading }: Props) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [spaceId, setSpaceId] = useState<string | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset internal state when modal is dismissed via cancel
  const handleCancel = useCallback(() => {
    setFiles([]);
    setSpaceId(undefined);
    setDragOver(false);
    onCancel();
  }, [onCancel]);

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const currentNames = new Set(files.map((f) => f.uploadFile.name));
      const toAdd: FileItem[] = [];

      for (const file of newFiles) {
        // Check for duplicates
        if (currentNames.has(file.name)) {
          Toast.warning(`文件 "${file.name}" 已存在`);
          continue;
        }

        // Check file format
        if (!isValidFile(file)) {
          Toast.warning(`不支持的文件格式: ${file.name}`);
          continue;
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          Toast.warning(`文件 "${file.name}" 超过50MB大小限制`);
          continue;
        }

        // Check total size
        const currentTotal = files.reduce((sum, f) => sum + f.uploadFile.size, 0) + toAdd.reduce((sum, f) => sum + f.uploadFile.size, 0);
        if (currentTotal + file.size > MAX_TOTAL_SIZE) {
          Toast.warning('文件总大小超过200MB限制');
          continue;
        }

        // Check max files
        if (files.length + toAdd.length >= MAX_FILES) {
          Toast.warning(`最多只能上传${MAX_FILES}个文件`);
          break;
        }

        const uploadFile: UploadFile = {
          id: generateId(),
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'pending',
        };

        toAdd.push({ uploadFile, rawFile: file });
        currentNames.add(file.name);
      }

      if (toAdd.length > 0) {
        setFiles((prev) => [...prev, ...toAdd]);
      }
    },
    [files],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      if (selectedFiles.length > 0) {
        addFiles(selectedFiles);
      }
      // Reset input value so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addFiles],
  );

  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.uploadFile.id !== id));
  }, []);

  const handleUpload = useCallback(() => {
    const rawFiles = files.map((f) => f.rawFile);
    onUpload(rawFiles, spaceId);
  }, [files, spaceId, onUpload]);

  const hasFiles = files.length > 0;

  const overallProgress =
    files.length > 0 ? Math.round(files.reduce((sum, f) => sum + f.uploadFile.progress, 0) / files.length) : 0;

  return (
    <Modal
      title="上传文件"
      visible={visible}
      onCancel={handleCancel}
      width={600}
      className="kb-upload-modal"
      maskClosable={!uploading}
      footer={
        <Space>
          <Button onClick={handleCancel} disabled={uploading}>
            取消
          </Button>
          <Button theme="solid" onClick={handleUpload} disabled={!hasFiles || uploading}>
            开始上传
          </Button>
        </Space>
      }
    >
      {/* Drop zone */}
      <div
        className={`kb-upload-modal__dropzone${dragOver ? ' kb-upload-modal__dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleDropZoneClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleDropZoneClick();
          }
        }}
      >
        <IconUpload size="large" />
        <p>将文件拖拽到此处，或点击选择文件</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={SUPPORTED_FORMATS.join(',')}
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="kb-upload-modal__file-list">
          {files.map((item) => (
            <div key={item.uploadFile.id} className="kb-upload-modal__file-item">
              <span className="kb-upload-modal__file-name">{item.uploadFile.name}</span>
              <span className="kb-upload-modal__file-size">{formatFileSize(item.uploadFile.size)}</span>
              <span className="kb-upload-modal__file-status">
                {item.uploadFile.status === 'pending'
                  ? '待上传'
                  : item.uploadFile.status === 'uploading'
                    ? '上传中'
                    : item.uploadFile.status === 'success'
                      ? '上传成功'
                      : item.uploadFile.error || '上传失败'}
              </span>
              <Button
                icon={<IconDelete />}
                type="tertiary"
                size="small"
                disabled={uploading}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  removeFile(item.uploadFile.id);
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Space selector */}
      {spaces && spaces.length > 0 && (
        <div className="kb-upload-modal__space-select">
          <Select
            placeholder="选择知识空间（可选）"
            value={spaceId}
            onChange={(v) => setSpaceId(v as string | undefined)}
            style={{ width: '100%' }}
            showClear
          >
            {spaces.map((space) => (
              <Select.Option key={space.id} value={space.id}>
                {space.name}
              </Select.Option>
            ))}
          </Select>
        </div>
      )}

      {/* Progress indicator */}
      {uploading && (
        <div style={{ marginTop: 16 }}>
          <Progress percent={overallProgress} />
        </div>
      )}

      <style>{`
        .kb-upload-modal__dropzone {
          border: 2px dashed #d9d9d9;
          border-radius: 8px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.3s, background-color 0.3s;
          background-color: #fafafa;
        }
        .kb-upload-modal__dropzone:hover {
          border-color: #1456f0;
          background-color: #f0f5ff;
        }
        .kb-upload-modal__dropzone--active {
          border-color: #1456f0;
          background-color: #f0f5ff;
        }
        .kb-upload-modal__dropzone p {
          margin-top: 12px;
          color: #666;
          font-size: 14px;
        }
        .kb-upload-modal__file-list {
          margin-top: 16px;
          max-height: 240px;
          overflow-y: auto;
        }
        .kb-upload-modal__file-item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          border: 1px solid #f0f0f0;
          border-radius: 6px;
          margin-bottom: 8px;
          gap: 12px;
        }
        .kb-upload-modal__file-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
        }
        .kb-upload-modal__file-size {
          color: #999;
          font-size: 12px;
          white-space: nowrap;
        }
        .kb-upload-modal__file-status {
          color: #999;
          font-size: 12px;
          white-space: nowrap;
        }
        .kb-upload-modal__space-select {
          margin-top: 16px;
        }
      `}</style>
    </Modal>
  );
}
