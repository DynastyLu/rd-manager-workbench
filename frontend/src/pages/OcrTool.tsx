import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { listVariants, itemVariants } from '@/lib/motion'
import DropZone from '@/components/OcrTool/DropZone'
import FileCard from '@/components/OcrTool/FileCard'
import BatchBar from '@/components/OcrTool/BatchBar'
import { ocrService } from '@/services/ocr'
import type { FileItem, TableData } from '@/types/ocr'

const MAX_CONCURRENT = 3

let _idCounter = 0
const genId = (): string => `item-${++_idCounter}`

export default function OcrTool() {
  const [items, setItems] = useState<FileItem[]>([])
  const processingIds = useRef<Set<string>>(new Set())
  const previewUrls = useRef<string[]>([])

  useEffect(() => {
    const urls = previewUrls.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<FileItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const processItem = useCallback(
    async (item: FileItem) => {
      processingIds.current.add(item.id)
      updateItem(item.id, { status: 'processing' })
      try {
        const json = await ocrService.recognize(item.file)
        if (!json.success) throw new Error('识别失败')
        updateItem(item.id, { status: 'done', tableData: json.data })
      } catch (err) {
        updateItem(item.id, {
          status: 'error',
          error: err instanceof Error ? err.message : '识别失败，请重试',
        })
      } finally {
        processingIds.current.delete(item.id)
      }
    },
    [updateItem]
  )

  useEffect(() => {
    const processingCount = items.filter((i) => i.status === 'processing').length
    const waitingItems = items.filter((i) => i.status === 'waiting')
    const slots = MAX_CONCURRENT - processingCount
    if (slots <= 0 || waitingItems.length === 0) return
    waitingItems.slice(0, slots).forEach((item) => {
      if (!processingIds.current.has(item.id)) void processItem(item)
    })
  }, [items, processItem])

  const handleFiles = useCallback((files: File[]) => {
    const newItems: FileItem[] = files.map((file) => {
      const preview = URL.createObjectURL(file)
      previewUrls.current.push(preview)
      return {
        id: genId(),
        file,
        name: file.name,
        preview,
        status: 'waiting',
        tableData: null,
        error: null,
      }
    })
    setItems((prev) => [...prev, ...newItems])
  }, [])

  const handleTableChange = useCallback(
    (id: string, tableData: TableData) => {
      updateItem(id, { tableData })
    },
    [updateItem]
  )

  const doneCount = items.filter((i) => i.status === 'done').length

  return (
    <div className="app-page app-page--ocr">
      <div className="app-page__inner app-page__inner--narrow">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Document Match</p>
            <h1 className="app-page__title">纸质表格识别</h1>
            <p className="app-page__subtitle">上传图片自动识别表格，校对后导出 Excel。</p>
          </div>
          <div className="app-page__meta">
            <span className="app-page__chip">最多 20 张</span>
            <span className="app-page__chip">并发 {MAX_CONCURRENT} 路</span>
            <span className="app-page__chip">已完成 {doneCount}</span>
          </div>
        </div>

        <DropZone
          onFiles={handleFiles}
          currentCount={items.length}
          doneCount={doneCount}
          totalCount={items.length}
        />

        {items.length > 0 && (
          <motion.div
            style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            variants={listVariants}
            initial="initial"
            animate="animate"
          >
            {items.map((item) => (
              <motion.div key={item.id} variants={itemVariants} layout="position">
                <FileCard
                  item={item}
                  onTableChange={(tableData) => handleTableChange(item.id, tableData)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {items.length === 0 && (
          <div className="stadium-placeholder" style={{ marginTop: 48, userSelect: 'none' }}>
            <div>
              <span className="stadium-placeholder__icon">📋</span>
              <p className="stadium-placeholder__title">等待文件入场</p>
              <p className="stadium-placeholder__text">上传图片后，识别结果会在这里排队显示。</p>
            </div>
          </div>
        )}
      </div>

      <BatchBar items={items} />
    </div>
  )
}
