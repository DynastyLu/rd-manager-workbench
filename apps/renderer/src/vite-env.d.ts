/// <reference types="vite/client" />

import type { WorkbenchPreloadApi } from '@rd-manager/contracts'

declare global {
  interface Window {
    workbench?: WorkbenchPreloadApi
  }
}

export {}
