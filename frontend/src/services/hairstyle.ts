import * as request from '@/lib/request'
import { isPendingJobResponse, pollJob } from './jobs'

export const HAIRSTYLE_OPTIONS = [
  { id: 'short-bob', label: '短波波', tone: '#5eead4' },
  { id: 'air-bangs', label: '空气刘海', tone: '#fbbf24' },
  { id: 'long-wave', label: '长卷发', tone: '#f472b6' },
  { id: 'silver-wolf', label: '银灰狼尾', tone: '#38bdf8' },
] as const

export type HairStyleId = (typeof HAIRSTYLE_OPTIONS)[number]['id']

export interface HairstyleTransformParams {
  image: File
  style: HairStyleId
}

export interface HairstyleTransformResult {
  success: boolean
  mode: 'demo' | 'ai'
  data: {
    imageUrl: string
    style: HairStyleId
    label: string
  }
}

export const hairstyleService = {
  transform: async ({
    image,
    style,
  }: HairstyleTransformParams): Promise<HairstyleTransformResult> => {
    const form = new FormData()
    form.append('image', image)
    form.append('style', style)
    const response = await request.postForm<unknown>('/api/hairstyle/transform', form)

    if (isPendingJobResponse(response)) {
      const job = await pollJob<Omit<HairstyleTransformResult, 'success'>>(response, {
        workerLabel: '发型处理 Worker',
      })
      const result = job.result
      if (!isHairstylePayload(result)) {
        throw new Error('发型变换结果格式异常')
      }
      return { success: true, ...result }
    }

    if (!isCompletedHairstyleResult(response)) {
      throw new Error('发型变换结果格式异常')
    }
    return response
  },
}

function isCompletedHairstyleResult(value: unknown): value is HairstyleTransformResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as HairstyleTransformResult).success === true &&
    isHairstylePayload(value)
  )
}

function isHairstylePayload(value: unknown): value is Omit<HairstyleTransformResult, 'success'> {
  const data = (value as HairstyleTransformResult | null)?.data
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as HairstyleTransformResult).mode !== undefined &&
    typeof data?.imageUrl === 'string' &&
    typeof data?.style === 'string' &&
    typeof data?.label === 'string'
  )
}
