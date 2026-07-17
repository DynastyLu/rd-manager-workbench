import * as request from '@/lib/request'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

export interface PendingJobResponse {
  success?: boolean
  pending: true
  jobId: string
  statusUrl?: string
  resultUrl?: string
}

export interface JobStatusResponse<TResult = unknown> {
  id: string
  status: string
  result?: TResult
  errorCode?: string
  errorMessage?: string
}

export function isPendingJobResponse(value: unknown): value is PendingJobResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PendingJobResponse).pending === true &&
    typeof (value as PendingJobResponse).jobId === 'string'
  )
}

export async function pollJob<TResult>(
  pending: PendingJobResponse,
  options: {
    timeoutMs?: number
    intervalMs?: number
    workerLabel?: string
    timeoutMessage?: string
  } = {}
): Promise<JobStatusResponse<TResult>> {
  const timeoutMs = options.timeoutMs ?? 60_000
  const intervalMs = options.intervalMs ?? 1_000
  const workerLabel = options.workerLabel ?? 'OCR Worker'
  const statusUrl = pending.statusUrl ?? `/api/jobs/${pending.jobId}`
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const payload = await request.get<
      ApiEnvelope<JobStatusResponse<TResult>> | JobStatusResponse<TResult>
    >(statusUrl)
    const job = unwrapJob(payload)
    const status = job.status.toLowerCase()

    if (status === 'succeeded') {
      return job
    }
    if (status === 'failed' || status === 'canceled') {
      throw new Error(job.errorMessage || job.errorCode || '任务处理失败')
    }

    await delay(intervalMs)
  }

  throw new Error(options.timeoutMessage ?? formatWorkerTimeoutMessage(workerLabel))
}

function unwrapJob<TResult>(
  payload: ApiEnvelope<JobStatusResponse<TResult>> | JobStatusResponse<TResult>
): JobStatusResponse<TResult> {
  const maybeEnvelope = payload as Partial<ApiEnvelope<JobStatusResponse<TResult>>>
  if (maybeEnvelope.data && typeof maybeEnvelope.data === 'object') {
    return maybeEnvelope.data
  }
  return payload as JobStatusResponse<TResult>
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatWorkerTimeoutMessage(workerLabel: string) {
  const leadingSpace = /^[A-Za-z0-9]/.test(workerLabel) ? ' ' : ''
  const trailingSpace = /[A-Za-z0-9]$/.test(workerLabel) ? ' ' : ''
  return `任务处理超时，请确认${leadingSpace}${workerLabel}${trailingSpace}已启动`
}
