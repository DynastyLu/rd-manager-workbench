import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Toast } from '@douyinfe/semi-ui'
import {
  getFileDownloadUrl,
  listFiles,
  trashFile,
  uploadFile,
} from '@/modules/workbench/api/documents'

type FileAssociations = { documentId?: string; projectId?: string; meetingId?: string }

export function FileAttachments({ associations }: { associations: FileAssociations }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const queryKey = ['files', associations]
  const filesQuery = useQuery({ queryKey, queryFn: () => listFiles(associations) })
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file, associations),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['files'] }),
    onError: () => Toast.error('附件上传失败，请确认本地文件服务可用。'),
  })
  const removeMutation = useMutation({
    mutationFn: trashFile,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['files'] }),
    onError: () => Toast.error('附件移入回收站失败。'),
  })

  return (
    <section className="file-attachments" aria-label="附件">
      <header>
        <h3>附件</h3>
        <Button size="small" onClick={() => inputRef.current?.click()} loading={uploadMutation.isPending}>
          上传附件
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          aria-label="选择附件"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) uploadMutation.mutate(file)
            event.target.value = ''
          }}
        />
      </header>
      {filesQuery.isPending ? <p>正在读取附件…</p> : null}
      {filesQuery.isError ? <p>无法读取附件。</p> : null}
      {filesQuery.data?.data.length ? (
        <ul>
          {filesQuery.data.data.map((file) => {
            const latest = file.versions[0]
            return (
              <li key={file.id}>
                <a href={getFileDownloadUrl(file.id)} download>{file.name}</a>
                <span>{latest ? `${Math.ceil(latest.size / 1024)} KB · v${latest.versionNumber}` : '暂无版本'}</span>
                <button type="button" onClick={() => removeMutation.mutate(file.id)}>移入回收站</button>
              </li>
            )
          })}
        </ul>
      ) : !filesQuery.isPending ? <p>还没有附件。</p> : null}
    </section>
  )
}

export default FileAttachments
