import { useState } from 'react'
import { useToast } from '@/stores/toast'
import { ocrService } from '@/services/ocr'
import type { FileItem } from '@/types/ocr'

interface BatchBarProps {
  items: FileItem[]
}

export default function BatchBar({ items }: BatchBarProps) {
  const [downloading, setDownloading] = useState(false)
  const toast = useToast()
  const doneItems = items.filter((i) => i.status === 'done')

  if (doneItems.length === 0) return null

  const handleDownloadAll = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const sheets = doneItems
        .filter((item) => item.tableData !== null)
        .map((item) => ({
          name: item.name.replace(/\.[^.]+$/, ''),
          rows: item.tableData!.rows,
          merged_cells: item.tableData!.merged_cells ?? [],
        }))
      const blob = await ocrService.exportBatch(sheets)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'tables.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`已导出 ${doneItems.length} 张表格`)
    } catch {
      toast.error('批量导出失败，请重试')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        padding: '12px 24px',
        background:
          'linear-gradient(90deg, rgba(6,19,38,0.96), rgba(6,43,31,0.94)), var(--bg-panel)',
        borderTop: '1px solid var(--border-color)',
        boxShadow: '0 -12px 34px rgba(0,0,0,0.32)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background:
            'linear-gradient(90deg, transparent, var(--accent-gold), var(--accent-green), transparent)',
          opacity: 'var(--neon-line-opacity, 0.5)' as React.CSSProperties['opacity'],
        }}
      />

      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          已完成{' '}
          <span
            style={{ fontWeight: 800, color: 'var(--accent-gold)', textShadow: 'var(--glow-gold)' }}
          >
            {doneItems.length}
          </span>{' '}
          张
        </p>
        <button
          onClick={() => {
            void handleDownloadAll()
          }}
          disabled={downloading}
          style={{
            padding: '8px 20px',
            background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-green))',
            border: '1px solid transparent',
            color: 'var(--text-inverse)',
            cursor: downloading ? 'not-allowed' : 'pointer',
            opacity: downloading ? 0.5 : 1,
            fontSize: 13,
            letterSpacing: 1,
            borderRadius: 'var(--radius, 2px)',
            textShadow: 'none',
            boxShadow: 'var(--glow-gold)',
            transition: 'all 0.15s',
          }}
        >
          {downloading ? '导出中...' : `下载全部为一个 Excel（${doneItems.length} 张）`}
        </button>
      </div>
    </div>
  )
}
