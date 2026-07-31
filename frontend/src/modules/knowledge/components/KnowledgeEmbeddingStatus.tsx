import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Tag, Toast } from '@douyinfe/semi-ui'
import { IconDownload, IconRefresh } from '@douyinfe/semi-icons'
import {
  getEmbeddingStatus,
  prepareEmbeddingModel,
  triggerReindex,
} from '../api'
import type { EmbeddingStatus } from '../api'

const ACTIVE_REINDEX_STATES = new Set(['QUEUED', 'RUNNING'])
const SAFE_MODEL_ERROR = '本地语义检索暂时不可用，请重试；全文检索仍可正常使用。'

function presentModelError(message?: string | null) {
  if (!message) return SAFE_MODEL_ERROR
  if (
    /require stack|node_modules|[A-Za-z]:\\|\/Users\/|\/home\/|file:\/\//i.test(message)
  ) {
    return SAFE_MODEL_ERROR
  }
  return message.slice(0, 180)
}

const lifecyclePresentation: Record<
  EmbeddingStatus['state'],
  { label: string; color: 'grey' | 'blue' | 'green' | 'red' }
> = {
  UNAVAILABLE: { label: '尚未启用', color: 'grey' },
  DOWNLOADING: { label: '正在下载模型', color: 'blue' },
  LOADING: { label: '正在加载模型', color: 'blue' },
  READY: { label: '本地语义检索已启用', color: 'green' },
  ERROR: { label: '启用失败', color: 'red' },
}

export function KnowledgeEmbeddingStatus() {
  const queryClient = useQueryClient()
  const statusQuery = useQuery({
    queryKey: ['knowledge-embedding-status'],
    queryFn: getEmbeddingStatus,
    refetchInterval: (query) => {
      const status = query.state.data
      const isPreparing = status?.state === 'DOWNLOADING' || status?.state === 'LOADING'
      const isReindexing = status?.reindex?.latestJob?.status
        ? ACTIVE_REINDEX_STATES.has(status.reindex.latestJob.status)
        : false
      return isPreparing || isReindexing ? 1500 : false
    },
  })
  const prepareMutation = useMutation({
    mutationFn: prepareEmbeddingModel,
    onSuccess: (status) => {
      if (status.ready) {
        Toast.success('本地语义检索已启用，知识库正在自动重新索引。')
      } else {
        Toast.error(presentModelError(status.lastError))
      }
      void queryClient.invalidateQueries({ queryKey: ['knowledge-embedding-status'] })
      void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] })
    },
    onError: () => Toast.error('本地语义检索启用失败，请重试。'),
  })
  const reindexMutation = useMutation({
    mutationFn: triggerReindex,
    onSuccess: () => {
      Toast.success('已开始重新索引。')
      void queryClient.invalidateQueries({ queryKey: ['knowledge-embedding-status'] })
      void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] })
    },
    onError: () => Toast.error('重新索引启动失败，请重试。'),
  })

  const status = statusQuery.data
  const state = status?.state ?? 'UNAVAILABLE'
  const presentation = lifecyclePresentation[state]
  const isPreparing = state === 'DOWNLOADING' || state === 'LOADING'
  const latestJob = status?.reindex?.latestJob
  const isReindexing = latestJob
    ? ACTIVE_REINDEX_STATES.has(latestJob.status)
    : false
  const actionLabel = state === 'ERROR' ? '重试启用' : '启用本地语义检索'
  const runtimeLabel = status?.runtime === 'wasm'
    ? 'WASM 兼容模式'
    : status?.runtime === 'native'
      ? '原生运行模式'
      : null

  if (statusQuery.isPending) {
    return (
      <Card className="kb-embedding-status" bodyStyle={{ padding: 12 }}>
        <div className="kb-embedding-status__state" role="status" aria-live="polite">
          正在读取本地检索状态…
        </div>
      </Card>
    )
  }

  if (statusQuery.isError) {
    return (
      <Card className="kb-embedding-status" bodyStyle={{ padding: 12 }}>
        <div className="kb-embedding-status__state" role="alert">
          <strong>无法读取本地检索状态</strong>
          <span>请确认本地服务已启动；全文检索仍可正常使用。</span>
          <Button
            size="small"
            aria-label="重试"
            icon={<IconRefresh />}
            onClick={() => void statusQuery.refetch()}
          >
            重试
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="kb-embedding-status" bodyStyle={{ padding: 12 }}>
      <div className="kb-embedding-status__header">
        <div>
          <div className="kb-embedding-status__eyebrow">NOVA AI · 检索设置</div>
          <h3>启用本地语义检索</h3>
        </div>
        <Tag color={presentation.color} size="small" aria-live="polite">
          {presentation.label}
        </Tag>
      </div>

      <p className="kb-embedding-status__description">
        在本机生成 384 维语义向量，用于召回近义表达和自然语言问题；模型不可用时全文检索始终可用。
      </p>

      {status?.ready ? (
        <div className="kb-embedding-status__details">
          {runtimeLabel ? <span>{runtimeLabel}</span> : null}
          {isReindexing && latestJob ? (
            <span>正在重新索引 {latestJob.processedFiles}/{latestJob.totalFiles}</span>
          ) : status.reindex ? (
            <span>
              已索引 {status.reindex.indexedDocuments}/{status.reindex.totalDocuments}
            </span>
          ) : null}
        </div>
      ) : null}

      {status?.lastError ? (
        <div className="kb-embedding-status__error" role="alert">
          {presentModelError(status.lastError)}
        </div>
      ) : null}

      {status?.persistence?.state === 'DEGRADED' ? (
        <div className="kb-embedding-status__persistence-warning" role="alert">
          {status.persistence.message
            ?? '模型本次可用，但未能持久化到本机；重启后可能需要重新下载。'}
        </div>
      ) : null}

      <div className="kb-embedding-status__actions">
        {!status?.ready ? (
          <Button
            aria-label={actionLabel}
            icon={<IconDownload />}
            loading={prepareMutation.isPending || isPreparing}
            disabled={isPreparing}
            onClick={() => prepareMutation.mutate()}
          >
            {actionLabel}
          </Button>
        ) : (
          <Button
            aria-label="重新索引"
            icon={<IconRefresh />}
            loading={reindexMutation.isPending || isReindexing}
            disabled={isReindexing}
            onClick={() => reindexMutation.mutate()}
          >
            重新索引
          </Button>
        )}
      </div>

      <style>{`
        .kb-embedding-status {
          width: 100%;
          border-color: rgba(31, 35, 41, 0.08);
          border-radius: 10px;
          background: linear-gradient(145deg, #ffffff 0%, #f7f8ff 100%);
          box-shadow: none;
        }
        .kb-embedding-status__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .kb-embedding-status__eyebrow {
          margin-bottom: 3px;
          color: #8f959e;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
        }
        .kb-embedding-status h3 {
          margin: 0;
          color: #1f2329;
          font-size: 14px;
          line-height: 20px;
        }
        .kb-embedding-status__description {
          margin: 8px 0 0;
          color: #646a73;
          font-size: 12px;
          line-height: 18px;
        }
        .kb-embedding-status__details {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          margin-top: 8px;
          color: #4e5969;
          font-size: 11px;
        }
        .kb-embedding-status__error {
          margin-top: 8px;
          color: #c73737;
          font-size: 11px;
          line-height: 16px;
        }
        .kb-embedding-status__persistence-warning {
          margin-top: 8px;
          padding: 7px 9px;
          border: 1px solid rgba(216, 135, 25, 0.2);
          border-radius: 7px;
          background: #fff8e8;
          color: #8f5b12;
          font-size: 11px;
          line-height: 16px;
        }
        .kb-embedding-status__state {
          display: grid;
          gap: 6px;
          color: #646a73;
          font-size: 12px;
          line-height: 18px;
        }
        .kb-embedding-status__state strong {
          color: #1f2329;
          font-size: 13px;
        }
        .kb-embedding-status__state .semi-button {
          width: fit-content;
          margin-top: 2px;
        }
        .kb-embedding-status__actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
        }
        .kb-embedding-status__actions .semi-button {
          min-height: 28px;
        }
      `}</style>
    </Card>
  )
}
