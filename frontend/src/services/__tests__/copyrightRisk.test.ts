import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as request from '@/lib/request'
import { copyrightRiskService } from '../copyrightRisk'

vi.mock('@/lib/request', () => ({
  postForm: vi.fn(),
  get: vi.fn(),
}))

describe('copyrightRiskService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(request.postForm).mockReset()
    vi.mocked(request.get).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a batch of copyright risk jobs and polls one completed result', async () => {
    vi.mocked(request.postForm).mockResolvedValueOnce({
      success: true,
      data: {
        pending: true,
        jobs: [
          {
            jobId: 'copyright-job-1',
            originalName: 'nike-poster.png',
            statusUrl: '/api/copyright/jobs/copyright-job-1',
            resultUrl: '/api/copyright/jobs/copyright-job-1',
          },
        ],
      },
    })
    vi.mocked(request.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'copyright-job-1',
        status: 'succeeded',
        result: {
          mode: 'heuristic',
          riskScore: 86,
          riskLevel: 'high',
          summary: '存在品牌标识风险',
          image: {
            width: 1200,
            height: 800,
            mimeType: 'image/png',
            originalName: 'nike-poster.png',
          },
          regions: [
            {
              id: 'brand-logo',
              x: 12,
              y: 14,
              width: 28,
              height: 20,
              label: '疑似品牌/Logo',
              riskType: 'trademark',
              severity: 'high',
              confidence: 0.88,
              reason: '文件名包含品牌线索',
              suggestion: '确认授权或替换素材',
            },
          ],
          recommendations: ['确认授权来源'],
          disclaimer: '仅用于版权/商标风险初筛，不构成法律意见或最终侵权判定。',
        },
      },
    })

    const file = new File(['image'], 'nike-poster.png', { type: 'image/png' })
    const batch = await copyrightRiskService.createBatch([file])

    expect(request.postForm).toHaveBeenCalledWith('/api/copyright/analyze', expect.any(FormData))
    const form = vi.mocked(request.postForm).mock.calls[0][1] as FormData
    expect(form.getAll('images')).toEqual([file])
    expect(batch.jobs[0]).toMatchObject({
      jobId: 'copyright-job-1',
      originalName: 'nike-poster.png',
    })

    const result = await copyrightRiskService.waitForResult(batch.jobs[0])

    expect(request.get).toHaveBeenCalledWith('/api/copyright/jobs/copyright-job-1')
    expect(result).toMatchObject({
      jobId: 'copyright-job-1',
      originalName: 'nike-poster.png',
      result: {
        riskLevel: 'high',
        regions: [{ label: '疑似品牌/Logo' }],
      },
    })
  })

  it('keeps the compatibility analyzeBatch helper for callers that need all results', async () => {
    vi.mocked(request.postForm).mockResolvedValueOnce({
      pending: true,
      count: 1,
      jobs: [
        {
          jobId: 'copyright-job-2',
          originalName: 'poster.png',
          statusUrl: '/api/copyright/jobs/copyright-job-2',
          resultUrl: '/api/copyright/jobs/copyright-job-2',
        },
      ],
    })
    vi.mocked(request.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'copyright-job-2',
        status: 'succeeded',
        result: {
          mode: 'heuristic',
          riskScore: 22,
          riskLevel: 'low',
          summary: '低风险',
          image: {
            width: 800,
            height: 600,
            mimeType: 'image/png',
            originalName: 'poster.png',
          },
          regions: [],
          recommendations: [],
          disclaimer: '仅用于版权/商标风险初筛，不构成法律意见或最终侵权判定。',
        },
      },
    })

    const file = new File(['image'], 'poster.png', { type: 'image/png' })
    const result = await copyrightRiskService.analyzeBatch([file])

    expect(result).toHaveLength(1)
    expect(result[0].result.riskLevel).toBe('low')
  })

  it('does not time out long AI batches after only ten minutes', async () => {
    vi.mocked(request.get).mockResolvedValue({
      success: true,
      data: {
        id: 'copyright-job-long',
        status: 'processing',
      },
    })
    let settled: string | false = false

    const pending = copyrightRiskService
      .waitForResult({
        jobId: 'copyright-job-long',
        originalName: 'large-batch.png',
        statusUrl: '/api/copyright/jobs/copyright-job-long',
        resultUrl: '/api/copyright/jobs/copyright-job-long',
      })
      .then(() => {
        settled = 'resolved'
      })
      .catch((error: unknown) => {
        settled = error instanceof Error ? error.message : 'rejected'
      })

    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1_000)

    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(20 * 60_000 + 2_000)
    await pending

    expect(settled).toBe('版权风险分析时间较长，请稍后查看任务状态')
  })
})
