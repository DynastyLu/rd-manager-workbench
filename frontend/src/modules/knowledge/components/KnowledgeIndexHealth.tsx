import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Tag, Toast } from '@douyinfe/semi-ui'
import {
  getIndexHealth,
  ignoreIndexHealthItem,
  retryAllIndexHealth,
  retryIndexHealthItem,
  type IndexHealthCategory,
} from '../api'

const CATEGORY_LABELS: Record<IndexHealthCategory, string> = {
  EXTRACTION_MISSING: '未提取',
  CHUNKS_MISSING: '未切分',
  EMBEDDINGS_MISSING: '未向量化',
  FILE_MISSING: '文件丢失',
  UNSUPPORTED_FORMAT: '格式不支持',
}

export function KnowledgeIndexHealth() {
  const queryClient = useQueryClient()
  const healthQuery = useQuery({
    queryKey: ['knowledge-index-health'],
    queryFn: () => getIndexHealth(),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['knowledge-index-health'] })
    void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] })
  }
  const retryOne = useMutation({
    mutationFn: (documentId: string) => retryIndexHealthItem(documentId),
    onSuccess: () => {
      Toast.success('索引修复完成')
      refresh()
    },
    onError: () => Toast.error('索引修复失败，请查看文件状态'),
  })
  const retryAll = useMutation({
    mutationFn: (category?: IndexHealthCategory) => retryAllIndexHealth(category),
    onSuccess: (result) => {
      Toast.success(`修复完成：成功 ${result.succeeded}，失败 ${result.failed}`)
      refresh()
    },
    onError: () => Toast.error('批量修复失败'),
  })
  const ignore = useMutation({
    mutationFn: (documentId: string) => ignoreIndexHealthItem(documentId),
    onSuccess: () => {
      Toast.success('已从 NOVA 索引范围中安全忽略')
      refresh()
    },
    onError: () => Toast.error('忽略失败'),
  })

  const health = healthQuery.data
  return (
    <Card className="kb-index-health" bodyStyle={{ padding: 16 }}>
      <header className="kb-index-health__header">
        <div>
          <h3>索引健康</h3>
          <p>集中修复未提取、未切分、未向量化或源文件异常的知识条目。</p>
        </div>
        <Button
          aria-label="重试全部失败项"
          loading={retryAll.isPending}
          disabled={!health?.items.length}
          onClick={() => retryAll.mutate(undefined)}
        >
          重试全部
        </Button>
      </header>
      {healthQuery.isPending ? <p>正在检查索引健康…</p> : null}
      {healthQuery.isError ? (
        <p role="alert">
          无法读取索引健康状态。
          <button type="button" onClick={() => void healthQuery.refetch()}>
            重试
          </button>
        </p>
      ) : null}
      {health ? (
        <p className="kb-index-health__scope-note">
          NOVA 当前排除 {health.excludedDocumentCount} 个未完成索引的文件
        </p>
      ) : null}
      {health && health.items.length === 0 ? <p>全部知识文件已进入可检索范围。</p> : null}
      <ul className="kb-index-health__list">
        {health?.items.map((item) => (
          <li key={item.documentId}>
            <div>
              <strong>{item.fileName}</strong>
              <span>{item.reason}</span>
            </div>
            <Tag color="orange">{CATEGORY_LABELS[item.category]}</Tag>
            <div className="kb-index-health__actions">
              <Button
                size="small"
                aria-label={`重试：${item.fileName}`}
                loading={retryOne.isPending && retryOne.variables === item.documentId}
                onClick={() => retryOne.mutate(item.documentId)}
              >
                重试
              </Button>
              <Button
                size="small"
                aria-label={`忽略：${item.fileName}`}
                loading={ignore.isPending && ignore.variables === item.documentId}
                onClick={() => ignore.mutate(item.documentId)}
              >
                忽略
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
