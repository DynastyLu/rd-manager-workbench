export type KnowledgeViewerKind =
  | 'pdf'
  | 'docx'
  | 'office-pdf'
  | 'spreadsheet'
  | 'markdown'
  | 'json'
  | 'html'
  | 'image'
  | 'text'
  | 'unsupported'

export function resolveKnowledgeViewerKind(
  fileName: string,
  mimeType: string | null | undefined,
): KnowledgeViewerKind {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  const mime = (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''

  if (extension === '.pdf' || mime === 'application/pdf') return 'pdf'
  if (
    extension === '.docx'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) return 'docx'
  if (
    ['.xls', '.xlsx', '.csv', '.ods'].includes(extension)
    || [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/vnd.oasis.opendocument.spreadsheet',
    ].includes(mime)
  ) return 'spreadsheet'
  if (extension === '.md' || extension === '.markdown' || mime === 'text/markdown') return 'markdown'
  if (extension === '.json' || mime === 'application/json') return 'json'
  if (['.html', '.htm'].includes(extension) || mime === 'text/html') return 'html'
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) {
    return 'image'
  }
  if (
    mime.startsWith('text/')
    || ['.txt', '.log', '.xml', '.yaml', '.yml', '.ini', '.conf'].includes(extension)
  ) return 'text'
  if (
    ['.doc', '.ppt', '.pptx', '.odt', '.odp'].includes(extension)
    || [
      'application/msword',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.presentation',
    ].includes(mime)
  ) return 'office-pdf'
  return 'unsupported'
}
