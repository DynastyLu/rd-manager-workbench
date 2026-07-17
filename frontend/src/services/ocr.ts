import * as request from '@/lib/request'
import { isPendingJobResponse, pollJob } from './jobs'
import type { TableData, MergedCell } from '@/types/ocr'

export type { MergedCell }

export interface OcrResult {
  success: boolean
  data: TableData
}

interface ExportSheet {
  name: string
  rows: string[][]
  merged_cells: MergedCell[]
}

export const ocrService = {
  /** POST /api/recognize (multipart) → async job → { success, data } */
  recognize: async (file: File): Promise<OcrResult> => {
    const form = new FormData()
    form.append('image', file)
    const response = await request.postForm<unknown>('/api/recognize', form)

    if (isPendingJobResponse(response)) {
      const job = await pollJob<TableData>(response, {
        timeoutMs: 180_000,
        timeoutMessage: 'OCR 处理时间较长，请稍后重试或查看任务状态',
      })
      if (!isTableData(job.result)) {
        throw new Error('识别结果格式异常')
      }
      return { success: true, data: job.result }
    }

    if (!isOcrResult(response)) {
      throw new Error('识别结果格式异常')
    }
    return response
  },

  /** POST /api/export → async job → Blob (.xlsx) */
  exportOne: async (payload: { rows: string[][]; merged_cells: MergedCell[] }): Promise<Blob> => {
    const response = await request.post<unknown>('/api/export', payload)
    if (!isPendingJobResponse(response)) {
      throw new Error('导出任务创建失败')
    }
    const job = await pollJob<{ downloadUrl?: string }>(response)
    if (!job.result?.downloadUrl) {
      throw new Error('导出结果缺少下载链接')
    }
    return request.getBlob(job.result.downloadUrl)
  },

  /** POST /api/export-batch → async job → Blob (.xlsx) */
  exportBatch: async (sheets: ExportSheet[]): Promise<Blob> => {
    const response = await request.post<unknown>('/api/export-batch', { sheets })
    if (!isPendingJobResponse(response)) {
      throw new Error('批量导出任务创建失败')
    }
    const job = await pollJob<{ downloadUrl?: string }>(response)
    if (!job.result?.downloadUrl) {
      throw new Error('批量导出结果缺少下载链接')
    }
    return request.getBlob(job.result.downloadUrl)
  },
}

function isOcrResult(value: unknown): value is OcrResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as OcrResult).success === true &&
    isTableData((value as OcrResult).data)
  )
}

function isTableData(value: unknown): value is TableData {
  return typeof value === 'object' && value !== null && Array.isArray((value as TableData).rows)
}
