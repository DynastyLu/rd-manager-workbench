import { useRef, useState } from 'react'

const ALLOWED_TYPES = ['image/jpeg', 'image/png']
const MAX_FILES = 20

interface DropZoneProps {
  onFiles: (files: File[]) => void
  currentCount: number
  doneCount: number
  totalCount: number
}

export default function DropZone({ onFiles, currentCount, doneCount, totalCount }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const atLimit = currentCount >= MAX_FILES

  const handleFiles = (fileList: FileList | File[]) => {
    const filtered = Array.from(fileList).filter((f) => ALLOWED_TYPES.includes(f.type))
    const remaining = MAX_FILES - currentCount
    onFiles(filtered.slice(0, remaining))
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (!atLimit) handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !atLimit && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!atLimit) inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!atLimit) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        position: 'relative',
        border: `2px dashed ${isDragging ? 'var(--border-active)' : 'var(--border-color)'}`,
        borderRadius: 'var(--radius, 2px)',
        padding: '36px 24px',
        textAlign: 'center',
        cursor: atLimit ? 'not-allowed' : 'pointer',
        opacity: atLimit ? 0.6 : 1,
        background: isDragging
          ? 'linear-gradient(135deg, rgba(246,208,93,0.12), rgba(36,193,107,0.1)), var(--bg-hover)'
          : 'linear-gradient(180deg, var(--bg-surface), var(--bg-panel))',
        boxShadow: isDragging ? 'var(--glow-gold)' : '0 16px 44px rgba(0,0,0,0.18)',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 10, userSelect: 'none' }}>🏟️</div>

      {atLimit ? (
        <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>已达上限（20 / 20）</p>
      ) : (
        <>
          <p
            style={{
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: 14,
              margin: '0 0 6px',
            }}
          >
            拖拽或点击上传，支持批量 · JPG / PNG
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
            已添加 {currentCount} / {MAX_FILES} 张
            {totalCount > 0 && (
              <span style={{ marginLeft: 12, color: 'var(--accent-gold)' }}>
                · 已完成 {doneCount} / {totalCount} 张
              </span>
            )}
          </p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="上传识别文件"
        style={{ display: 'none' }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files ?? [])}
      />
    </div>
  )
}
