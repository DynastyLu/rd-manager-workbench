import * as request from '@/lib/request'
import { pollJob, type JobStatusResponse } from './jobs'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

export type CopyrightRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface CopyrightRiskRegion {
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  riskType: 'trademark' | 'character' | 'watermark' | 'artwork' | 'portrait' | 'unclear-source'
  severity: CopyrightRiskLevel
  confidence: number
  reason: string
  suggestion: string
}

export interface CopyrightRiskVisualElement {
  id: string
  type: 'person' | 'logo' | 'text' | 'product' | 'character' | 'artwork' | 'scene' | 'other'
  label: string
  description: string
  riskLevel: CopyrightRiskLevel
  confidence: number
}

export interface CopyrightRiskRight {
  id: string
  rightType: 'copyright' | 'trademark' | 'portrait' | 'font' | 'source' | 'publicity' | 'other'
  riskLevel: CopyrightRiskLevel
  evidence: string
  explanation: string
  recommendation: string
}

export interface CopyrightRiskUsageAssessment {
  scenario: 'internal' | 'social-media' | 'ecommerce' | 'advertising' | 'print' | 'other'
  riskLevel: CopyrightRiskLevel
  advice: string
}

export interface CopyrightRiskAnalysisResult {
  mode: 'ai' | 'heuristic'
  provider?: string
  analysisScope?: 'full-image' | 'filename-rules'
  riskScore: number
  riskLevel: CopyrightRiskLevel
  summary: string
  imageDescription?: string
  detectedText?: string[]
  image: {
    width: number
    height: number
    mimeType: string
    originalName: string
  }
  regions: CopyrightRiskRegion[]
  visualElements?: CopyrightRiskVisualElement[]
  rightsRisks?: CopyrightRiskRight[]
  usageAssessments?: CopyrightRiskUsageAssessment[]
  needsHumanReview?: boolean
  recommendations: string[]
  disclaimer: string
}

export interface CopyrightRiskBatchJob {
  jobId: string
  originalName: string
  statusUrl: string
  resultUrl: string
}

export interface CopyrightRiskBatchResponse {
  pending: true
  count: number
  jobs: CopyrightRiskBatchJob[]
}

export interface CopyrightRiskCompletedItem {
  jobId: string
  originalName: string
  result: CopyrightRiskAnalysisResult
}

const COPYRIGHT_RISK_POLL_TIMEOUT_MS = 30 * 60_000

export const copyrightRiskService = {
  createBatch: async (files: File[]): Promise<CopyrightRiskBatchResponse> => {
    const form = new FormData()
    files.forEach((file) => form.append('images', file))

    const response = await request.postForm<
      ApiEnvelope<CopyrightRiskBatchResponse> | CopyrightRiskBatchResponse
    >('/api/copyright/analyze', form)
    const batch = unwrapEnvelope(response)
    if (!isBatchResponse(batch)) {
      throw new Error('版权风险任务创建失败')
    }

    return batch
  },

  waitForResult: async (pending: CopyrightRiskBatchJob): Promise<CopyrightRiskCompletedItem> => {
    const job = await pollJob<CopyrightRiskAnalysisResult>(
      {
        pending: true,
        jobId: pending.jobId,
        statusUrl: pending.statusUrl,
        resultUrl: pending.resultUrl,
      },
      {
        timeoutMs: COPYRIGHT_RISK_POLL_TIMEOUT_MS,
        workerLabel: '版权风险 Worker',
        timeoutMessage: '版权风险分析时间较长，请稍后查看任务状态',
      }
    )
    const result = job.result
    if (!isCopyrightRiskResult(result)) {
      throw new Error('版权风险分析结果格式异常')
    }
    return {
      jobId: pending.jobId,
      originalName: pending.originalName,
      result,
    }
  },

  analyzeBatch: async (files: File[]): Promise<CopyrightRiskCompletedItem[]> => {
    const batch = await copyrightRiskService.createBatch(files)
    return Promise.all(batch.jobs.map((job) => copyrightRiskService.waitForResult(job)))
  },
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T> | T): T {
  const maybeEnvelope = payload as Partial<ApiEnvelope<T>>
  if (maybeEnvelope.data && typeof maybeEnvelope.data === 'object') {
    return maybeEnvelope.data
  }
  return payload as T
}

function isBatchResponse(value: unknown): value is CopyrightRiskBatchResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as CopyrightRiskBatchResponse).pending === true &&
    Array.isArray((value as CopyrightRiskBatchResponse).jobs)
  )
}

function isCopyrightRiskResult(
  value: JobStatusResponse<CopyrightRiskAnalysisResult>['result']
): value is CopyrightRiskAnalysisResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.riskScore === 'number' &&
    typeof value.riskLevel === 'string' &&
    Array.isArray(value.regions)
  )
}
