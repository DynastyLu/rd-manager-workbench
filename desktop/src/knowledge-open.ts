export interface KnowledgeOpenInput {
  documentId: string
}

export interface KnowledgeOpenDependencies {
  fetchImpl: typeof fetch
  openPath(filePath: string): Promise<string>
  backendBaseUrl: string
}

export async function openKnowledgeOriginal(
  input: KnowledgeOpenInput,
  dependencies: KnowledgeOpenDependencies,
): Promise<{ opened: boolean; error?: string }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.documentId)) {
    throw new Error('INVALID_DOCUMENT_ID')
  }

  const response = await dependencies.fetchImpl(
    `${dependencies.backendBaseUrl}/knowledge/documents/${encodeURIComponent(input.documentId)}/local-open-path`,
    { signal: AbortSignal.timeout(5_000) },
  )
  if (!response.ok) throw new Error(`LOCAL_SOURCE_RESOLVE_FAILED_${response.status}`)
  const body = await response.json() as {
    data?: { filePath?: unknown }
  }
  const filePath = body.data?.filePath
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('LOCAL_SOURCE_PATH_MISSING')
  }

  const error = await dependencies.openPath(filePath)
  return error ? { opened: false, error } : { opened: true }
}
