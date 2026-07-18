import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Toast } from '@douyinfe/semi-ui'
import {
  getFileDownloadUrl,
  listFiles,
  trashFile,
  uploadFile,
  uploadFileVersion,
} from '@/modules/workbench/api/documents'

type FileAssociations = { documentId?: string; projectId?: string; meetingId?: string }

export function FileAttachments({ associations }: { associations: FileAssociations }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const versionInputRef = useRef<HTMLInputElement>(null)
  const [versionTargetId, setVersionTargetId] = useState<string | null>(null)
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
  const versionMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadFileVersion(id, file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['files'] }),
    onError: () => Toast.error('上传附件新版本失败。'),
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
        <input
          ref={versionInputRef}
          type="file"
          hidden
          aria-label="选择附件新版本"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file && versionTargetId) versionMutation.mutate({ id: versionTargetId, file })
            event.target.value = ''
            setVersionTargetId(null)
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
                <span className="file-attachments__actions">
                  <button
                    type="button"
                    onClick={() => {
                      setVersionTargetId(file.id)
                      versionInputRef.current?.click()
                    }}
                  >
                    上传新版本
                  </button>
                  <button type="button" onClick={() => removeMutation.mutate(file.id)}>移入回收站</button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : !filesQuery.isPending ? <p>还没有附件。</p> : null}
    </section>
  )
}

export default FileAttachments
