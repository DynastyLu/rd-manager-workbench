import { useState } from 'react'
import EditableTable from '@/components/EditableTable/EditableTable'
import { useToast } from '@/stores/toast'
import { ocrService } from '@/services/ocr'
import type { FileItem, TableData } from '@/types/ocr'

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  waiting: { label: '等待中', color: 'var(--text-muted)', bg: 'var(--bg-panel)' },
  processing: { label: '识别中', color: 'var(--accent-gold)', bg: 'rgba(246,208,93,0.12)' },
  done: { label: '已完成', color: 'var(--accent-green)', bg: 'rgba(36,193,107,0.12)' },
  error: { label: '失败', color: 'var(--accent-pink)', bg: 'rgba(240,77,77,0.1)' },
}

interface FileCardProps {
  item: FileItem
  onTableChange: (tableData: TableData) => void
}

export default function FileCard({ item, onTableChange }: FileCardProps) {
  const [downloading, setDownloading] = useState(false)
  const toast = useToast()
  const { name, preview, status, tableData, error } = item
  const cfg = STATUS[status] ?? STATUS['waiting']!

  const handleDownload = async () => {
    if (!tableData || downloading) return
    setDownloading(true)
    try {
      const blob = await ocrService.exportOne({
        rows: tableData.rows,
        merged_cells: tableData.merged_cells ?? [],
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name.replace(/\.[^.]+$/, '') + '.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('导出失败，请重试')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-panel))',
        border: `1px solid ${status === 'processing' ? 'var(--border-active)' : 'var(--border-color)'}`,
        borderRadius: 'var(--radius, 2px)',
        overflow: 'hidden',
        boxShadow: status === 'processing' ? 'var(--glow-gold)' : '0 16px 48px rgba(0,0,0,0.16)',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'linear-gradient(90deg, rgba(246,208,93,0.08), transparent)',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 300,
          }}
          title={name}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: '3px 9px',
            borderRadius: 8,
            color: cfg.color,
            background: cfg.bg,
            flexShrink: 0,
            marginLeft: 8,
            letterSpacing: 0.5,
            border: `1px solid ${cfg.color}33`,
          }}
        >
          {cfg.label}
        </span>
      </div>

      {/* 预览图 */}
      <div
        style={{
          position: 'relative',
          height: 160,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.03), transparent), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 72px), var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt={name}
            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ fontSize: 40, userSelect: 'none' }}>🖼️</span>
        )}
        {status === 'processing' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(246,208,93,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: '3px solid var(--accent-gold)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation:
                  'filecard-spin 0.8s linear infinite, spinner-glow 1.2s ease-in-out infinite',
              }}
            />
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {status === 'error' && (
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(240,77,77,0.08)',
            color: 'var(--accent-pink)',
            fontSize: 13,
            borderTop: '1px solid rgba(240,77,77,0.22)',
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* 可编辑表格 */}
      {status === 'done' && tableData && (
        <div
          style={{
            padding: '12px 16px',
            overflowX: 'auto',
            maxHeight: 360,
            borderTop: '1px solid var(--border-color)',
          }}
        >
          {tableData.cell_confidence && (
            <p style={{ fontSize: 12, color: 'var(--accent-gold)', margin: '0 0 8px' }}>
              ⚠ 黄色单元格置信度较低，请核查
            </p>
          )}
          <EditableTable data={tableData} onChange={onTableChange} />
        </div>
      )}

      {/* 底部下载 */}
      {status === 'done' && (
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={() => {
              void handleDownload()
            }}
            disabled={downloading}
            style={{
              padding: '6px 16px',
              fontSize: 12,
              cursor: downloading ? 'not-allowed' : 'pointer',
              opacity: downloading ? 0.5 : 1,
              background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-green))',
              border: '1px solid transparent',
              color: 'var(--text-inverse)',
              borderRadius: 'var(--radius, 2px)',
              letterSpacing: 1,
              transition: 'all 0.15s',
            }}
          >
            {downloading ? '导出中...' : '下载 Excel'}
          </button>
        </div>
      )}
    </div>
  )
}
