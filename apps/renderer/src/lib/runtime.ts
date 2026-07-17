import { runtimeConfigSchema, type RuntimeConfig } from '@rd-manager/contracts'

const ALLOWED_PRELOAD_KEYS = new Set(['getRuntimeConfig'])

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const preloadApi = window.workbench

  if (
    preloadApi === undefined ||
    typeof preloadApi.getRuntimeConfig !== 'function' ||
    Object.keys(preloadApi).some((key) => !ALLOWED_PRELOAD_KEYS.has(key))
  ) {
    throw new Error('桌面运行时接口校验失败')
  }

  const untrustedConfig: unknown = await preloadApi.getRuntimeConfig()
  const result = runtimeConfigSchema.safeParse(untrustedConfig)

  if (!result.success) {
    throw new Error('运行时配置校验失败')
  }

  return result.data
}
