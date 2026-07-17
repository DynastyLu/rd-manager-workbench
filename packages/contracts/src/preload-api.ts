import type { RuntimeConfig } from './runtime-config.js'

export interface WorkbenchPreloadApi {
  getRuntimeConfig(): Promise<RuntimeConfig>
}
