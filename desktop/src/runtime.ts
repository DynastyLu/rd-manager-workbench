import path from 'node:path'

export interface RuntimePathsInput {
  isPackaged: boolean
  resourcesPath: string
  projectRoot: string
  rendererUrl?: string
  backendEntry?: string
}

export function resolveRendererTarget(input: RuntimePathsInput): { kind: 'url' | 'file'; value: string } {
  if (input.rendererUrl?.trim()) return { kind: 'url', value: input.rendererUrl.trim() }
  if (!input.isPackaged) return { kind: 'url', value: 'http://127.0.0.1:4312' }
  return { kind: 'file', value: path.join(input.resourcesPath, 'frontend', 'index.html') }
}

export function resolveBackendEntry(input: RuntimePathsInput): string | null {
  if (input.backendEntry?.trim()) return path.resolve(input.backendEntry.trim())
  if (!input.isPackaged) return null
  return path.join(input.resourcesPath, 'backend', 'dist', 'src', 'main.js')
}

export function normalizeSourcePath(sourcePath: string): string {
  const trimmed = sourcePath.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/'
  return trimmed
}
