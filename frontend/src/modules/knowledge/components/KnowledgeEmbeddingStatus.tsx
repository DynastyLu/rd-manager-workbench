import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Tag, Toast } from '@douyinfe/semi-ui'
import { IconDownload, IconRefresh } from '@douyinfe/semi-icons'
import {
  getEmbeddingStatus,
  prepareEmbeddingModel,
  triggerReindex,
} from '../api'

export function KnowledgeEmbeddingStatus() {
  const queryClient = useQueryClient()
  const statusQuery = useQuery({
    queryKey: ['knowledge-embedding-status'],
    queryFn: getEmbeddingStatus,
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return state === 'DOWNLOADING' || state === 'LOADING' ? 1500 : false
    },
  })
  const prepareMutation = useMutation({
    mutationFn: async () => {
      const status = await prepareEmbeddingModel()
      await triggerReindex()
      return status
    },
    onSuccess: () => {
      Toast.success('本地语义模型已启用，正在重新索引知识库。')
      void queryClient.invalidateQueries({ queryKey: ['knowledge-embedding-status'] })
      void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] })
    },
    onError: (error: Error) => Toast.error(`本地模型准备失败：${error.message}`),
  })

  const status = statusQuery.data
  return (
    <Card className="kb-embedding-status" bodyStyle={{ padding: '14px 16px' }}>
      <div className="kb-embedding-status__main">
        <div>
          <div className="kb-embedding-status__title">
            <strong>本地知识检索</strong>
            <Tag color={status?.ready ? 'green' : 'orange'} size="small">
              {status?.ready ? '语义检索已启用' : '全文检索已可用'}
            </Tag>
          </div>
          <p>
            {status?.ready
              ? '上传文件和本地同步文件会同时进入全文与本地语义检索，文件内容不会发送到向量服务。'
              : '当前已可按标题和正文全文搜索；可按需下载本地语义模型，提高近义表达和自然语言问题的召回率。'}
          </p>
          {status?.lastError ? <small>{status.lastError}</small> : null}
        </div>
        {!status?.ready ? (
          <Button
            aria-label="下载并启用本地语义模型"
            icon={<IconDownload />}
            loading={prepareMutation.isPending || status?.state === 'DOWNLOADING'}
            onClick={() => prepareMutation.mutate()}
          >
            下载并启用本地语义模型
          </Button>
        ) : (
          <Button
            icon={<IconRefresh />}
            onClick={() => void triggerReindex().then(() => {
              Toast.success('已开始重新索引。')
              void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] })
            })}
          >
            重新索引
          </Button>
        )}
      </div>
      <style>{`
        .kb-embedding-status { margin-bottom: 14px; }
        .kb-embedding-status__main {
          display: flex; align-items: center; justify-content: space-between; gap: 20px;
        }
        .kb-embedding-status__title { display: flex; align-items: center; gap: 8px; }
        .kb-embedding-status p { margin: 6px 0 0; color: #646a73; font-size: 13px; line-height: 1.6; }
        .kb-embedding-status small { display: block; margin-top: 5px; color: #d46b08; }
      `}</style>
    </Card>
  )
}
