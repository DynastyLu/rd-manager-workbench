import { config } from '@/lib/config'

export interface ApiUrlRuntime {
  apiBaseUrl: string
  isDevelopment: boolean
  pageProtocol: string
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function resolveApiUrl(path: string, runtime: ApiUrlRuntime): string {
  const configured = normalizeBaseUrl(runtime.apiBaseUrl)
  const baseUrl =
    configured || (runtime.isDevelopment ? 'http://127.0.0.1:4311/api' : '')

  if (!baseUrl) {
    const context =
      runtime.pageProtocol === 'file:' ? 'Electron file:// 页面' : '当前页面'
    throw new Error(`${context}缺少运行时 API 地址，请检查 config.js。`)
  }

  return `${baseUrl}/${path.replace(/^\/+/, '')}`
}

export function apiUrl(path: string): string {
  return resolveApiUrl(path, {
    apiBaseUrl: config.apiBaseUrl,
    isDevelopment: import.meta.env.DEV,
    pageProtocol: window.location.protocol,
  })
}
