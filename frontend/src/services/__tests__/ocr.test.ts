import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as request from '@/lib/request'
import { ocrService } from '../ocr'

vi.mock('@/lib/request', () => ({
  post: vi.fn(),
  postForm: vi.fn(),
  get: vi.fn(),
  getBlob: vi.fn(),
}))

describe('ocrService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(request.post).mockReset()
    vi.mocked(request.postForm).mockReset()
    vi.mocked(request.get).mockReset()
    vi.mocked(request.getBlob).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls async recognition jobs and returns completed table data', async () => {
    vi.mocked(request.postForm).mockResolvedValueOnce({
      success: false,
      pending: true,
      jobId: 'ocr-job-1',
      statusUrl: '/api/jobs/ocr-job-1',
      resultUrl: '/api/tools/ocr/jobs/ocr-job-1/result',
    })
    vi.mocked(request.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'ocr-job-1',
        status: 'succeeded',
        result: {
          rows: [['姓名', '分数']],
          cell_confidence: [[0.9, 0.9]],
          merged_cells: [],
        },
      },
    })

    const file = new File(['table'], 'table.png', { type: 'image/png' })
    const result = await ocrService.recognize(file)

    expect(request.get).toHaveBeenCalledWith('/api/jobs/ocr-job-1')
    expect(result).toEqual({
      success: true,
      data: {
        rows: [['姓名', '分数']],
        cell_confidence: [[0.9, 0.9]],
        merged_cells: [],
      },
    })
  })

  it('keeps polling recognition jobs long enough for backend OCR retries', async () => {
    vi.mocked(request.postForm).mockResolvedValueOnce({
      success: false,
      pending: true,
      jobId: 'slow-ocr-job-1',
      statusUrl: '/api/jobs/slow-ocr-job-1',
      resultUrl: '/api/tools/ocr/jobs/slow-ocr-job-1/result',
    })
    vi.mocked(request.get).mockImplementation(async () => {
      if (vi.mocked(request.get).mock.calls.length < 105) {
        return {
          success: true,
          data: {
            id: 'slow-ocr-job-1',
            status: 'processing',
          },
        }
      }
      return {
        success: true,
        data: {
          id: 'slow-ocr-job-1',
          status: 'failed',
          errorMessage: 'OCR 服务暂时不可用，请稍后重试',
        },
      }
    })

    const file = new File(['table'], 'table.png', { type: 'image/png' })
    const assertion = expect(ocrService.recognize(file)).rejects.toThrow(
      'OCR 服务暂时不可用，请稍后重试'
    )
    await vi.advanceTimersByTimeAsync(105_000)

    await assertion
  })

  it('creates async export jobs and downloads the completed workbook', async () => {
    const blob = new Blob(['xlsx'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const payload = {
      rows: [['姓名', '分数']],
      merged_cells: [],
    }

    vi.mocked(request.post).mockResolvedValueOnce({
      success: false,
      pending: true,
      jobId: 'export-job-1',
      statusUrl: '/api/jobs/export-job-1',
      resultUrl: '/api/tools/ocr/jobs/export-job-1/result',
    })
    vi.mocked(request.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'export-job-1',
        status: 'succeeded',
        result: {
          downloadUrl: '/api/files/file-1/download',
        },
      },
    })
    vi.mocked(request.getBlob).mockResolvedValueOnce(blob)

    const result = await ocrService.exportOne(payload)

    expect(request.post).toHaveBeenCalledWith('/api/export', payload)
    expect(request.get).toHaveBeenCalledWith('/api/jobs/export-job-1')
    expect(request.getBlob).toHaveBeenCalledWith('/api/files/file-1/download')
    expect(result).toBe(blob)
  })

  it('creates async batch export jobs and downloads the completed workbook', async () => {
    const blob = new Blob(['xlsx'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const sheets = [
      {
        name: '成绩表',
        rows: [['姓名', '分数']],
        merged_cells: [],
      },
    ]

    vi.mocked(request.post).mockResolvedValueOnce({
      success: false,
      pending: true,
      jobId: 'batch-export-job-1',
      statusUrl: '/api/jobs/batch-export-job-1',
      resultUrl: '/api/tools/ocr/jobs/batch-export-job-1/result',
    })
    vi.mocked(request.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'batch-export-job-1',
        status: 'succeeded',
        result: {
          downloadUrl: '/api/files/file-2/download',
        },
      },
    })
    vi.mocked(request.getBlob).mockResolvedValueOnce(blob)

    const result = await ocrService.exportBatch(sheets)

    expect(request.post).toHaveBeenCalledWith('/api/export-batch', { sheets })
    expect(request.get).toHaveBeenCalledWith('/api/jobs/batch-export-job-1')
    expect(request.getBlob).toHaveBeenCalledWith('/api/files/file-2/download')
    expect(result).toBe(blob)
  })
})
