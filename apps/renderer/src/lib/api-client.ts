import { runtimeConfigSchema, type RuntimeConfig } from '@rd-manager/contracts'
import { z } from 'zod'

const REQUEST_TIMEOUT_MS = 5_000

const readinessEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        status: z.literal('ready'),
        database: z.literal('ready'),
      })
      .strict(),
  })
  .strict()

export class WorkbenchApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'WorkbenchApiError'
  }
}

export function createApiClient(
  untrustedRuntime: RuntimeConfig,
  fetchImplementation: typeof fetch = globalThis.fetch,
) {
  const runtimeResult = runtimeConfigSchema.safeParse(untrustedRuntime)

  if (!runtimeResult.success) {
    throw new WorkbenchApiError('本地 API 配置无效')
  }

  const runtime = runtimeResult.data

  return {
    async getReadiness() {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const response = await fetchImplementation(`${runtime.apiBaseUrl}/api/health/ready`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'x-workbench-token': runtime.sessionToken,
          },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new WorkbenchApiError('本地服务暂时不可用', response.status)
        }

        const untrustedBody: unknown = await response.json()
        const bodyResult = readinessEnvelopeSchema.safeParse(untrustedBody)

        if (!bodyResult.success) {
          throw new WorkbenchApiError('本地服务返回了无效响应')
        }

        return bodyResult.data.data
      } catch (error) {
        if (error instanceof WorkbenchApiError) {
          throw error
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new WorkbenchApiError('本地服务检查超时')
        }

        throw new WorkbenchApiError('无法连接本地服务')
      } finally {
        window.clearTimeout(timeoutId)
      }
    },
  }
}
