import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as request from '@/lib/request'
import { pollJob } from '../jobs'

vi.mock('@/lib/request', () => ({
  get: vi.fn(),
}))

describe('pollJob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(request.get).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the worker label in timeout messages', async () => {
    vi.mocked(request.get).mockResolvedValue({
      id: 'job-1',
      status: 'queued',
    })

    const assertion = expect(
      pollJob(
        { pending: true, jobId: 'job-1', statusUrl: '/api/jobs/job-1' },
        { timeoutMs: 1_000, intervalMs: 100, workerLabel: '发型处理 Worker' }
      )
    ).rejects.toThrow('任务处理超时，请确认发型处理 Worker 已启动')
    await vi.advanceTimersByTimeAsync(1_100)

    await assertion
  })
})
