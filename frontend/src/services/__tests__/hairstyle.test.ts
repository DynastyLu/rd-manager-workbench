import { describe, expect, it, vi } from 'vitest'
import * as request from '@/lib/request'
import { hairstyleService } from '../hairstyle'

vi.mock('@/lib/request', () => ({
  postForm: vi.fn(),
  get: vi.fn(),
}))

describe('hairstyleService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(request.postForm).mockReset()
    vi.mocked(request.get).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('posts image and style as form data', async () => {
    vi.mocked(request.postForm).mockResolvedValueOnce({
      success: true,
      mode: 'demo',
      data: {
        imageUrl: 'data:image/svg+xml;base64,test',
        style: 'short-bob',
        label: '短波波',
      },
    })

    const file = new File(['portrait'], 'portrait.jpg', { type: 'image/jpeg' })
    const result = await hairstyleService.transform({ image: file, style: 'short-bob' })

    expect(request.postForm).toHaveBeenCalledWith('/api/hairstyle/transform', expect.any(FormData))
    const form = vi.mocked(request.postForm).mock.calls[0][1] as FormData
    expect(form.get('image')).toBe(file)
    expect(form.get('style')).toBe('short-bob')
    expect(result.data.style).toBe('short-bob')
  })

  it('polls async transform jobs and returns the completed image result', async () => {
    vi.mocked(request.postForm).mockResolvedValueOnce({
      success: false,
      pending: true,
      jobId: 'job-1',
      statusUrl: '/api/jobs/job-1',
      resultUrl: '/api/tools/hairstyle/jobs/job-1',
    })
    vi.mocked(request.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'job-1',
        status: 'succeeded',
        result: {
          mode: 'demo',
          data: {
            imageUrl: 'data:image/svg+xml;base64,result',
            style: 'short-bob',
            label: '短波波',
          },
        },
      },
    })

    const file = new File(['portrait'], 'portrait.jpg', { type: 'image/jpeg' })
    const result = await hairstyleService.transform({ image: file, style: 'short-bob' })

    expect(request.get).toHaveBeenCalledWith('/api/jobs/job-1')
    expect(result).toMatchObject({
      success: true,
      mode: 'demo',
      data: {
        imageUrl: 'data:image/svg+xml;base64,result',
        style: 'short-bob',
      },
    })
  })
})
