import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FileAttachments } from '../FileAttachments'

const { listFiles } = vi.hoisted(() => ({ listFiles: vi.fn() }))

vi.mock('@/modules/workbench/api/documents', () => ({
  listFiles,
  getFileDownloadUrl: (id: string) => `/api/files/${id}/download`,
  trashFile: vi.fn(),
  uploadFile: vi.fn(),
  uploadFileVersion: vi.fn(),
}))
vi.mock('@/modules/workbench/components/extensions/SyncBusinessAction', () => ({
  SyncBusinessAction: ({ buttonLabel, target }: { buttonLabel: string; target: { type: string; fileAssetId: string } }) => (
    <button type="button" data-target={`${target.type}:${target.fileAssetId}`}>{buttonLabel}</button>
  ),
}))

describe('FileAttachments', () => {
  beforeEach(() => {
    listFiles.mockResolvedValue({
      data: [
        {
          id: 'file-1',
          name: '研发方案.pdf',
          versions: [
            { id: 'version-1', versionNumber: 1, size: 2048, mimeType: 'application/pdf', sha256: 'a'.repeat(64) },
          ],
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
  })

  it('marks the exact file selected by a search deep link', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FileAttachments associations={{ documentId: 'document-1' }} focusedFileId="file-1" />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('listitem', { current: true })).toHaveTextContent('研发方案.pdf')
  })

  it('lists attachments using the real partner association', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FileAttachments associations={{ partnerId: 'partner-1' }} />
      </QueryClientProvider>,
    )

    await screen.findByText('研发方案.pdf')
    expect(listFiles).toHaveBeenCalledWith({ partnerId: 'partner-1' })
  })

  it('offers a WebDAV preflight entry for the latest attachment versions', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FileAttachments associations={{ documentId: 'document-1' }} />
      </QueryClientProvider>,
    )

    const sync = await screen.findByRole('button', { name: 'WebDAV 同步：研发方案.pdf' })
    await waitFor(() => expect(sync).toHaveAttribute('data-target', 'FILE:file-1'))
    expect(screen.getByText('WebDAV 单文件上限 750 KB')).toBeInTheDocument()
  })
})
