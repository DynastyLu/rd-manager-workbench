import { Button, Tag } from '@douyinfe/semi-ui'
import { Link } from 'react-router-dom'

import type { SearchAction, SearchHit } from '@/modules/workbench/api/search'
import { SearchHighlight } from './SearchHighlight'

const SEARCH_TYPE_LABELS: Record<SearchHit['type'], string> = {
  PROJECT: '项目',
  TASK: '任务',
  APPLICATION_CASE: '申报',
  MEETING: '会议',
  DOCUMENT: '文档',
  FILE: '附件',
  RISK: '风险',
  ISSUE: '问题',
  DECISION: '决策',
  PARTNER: '合作方',
  COMMUNICATION: '沟通',
  NON_PROJECT_RD: '非项目研发',
  INTELLIGENCE_ITEM: '行业情报',
  BASE_RECORD: '多维表格',
}

const ACTION_LABELS: Partial<Record<SearchAction, string>> = {
  COPY_LINK: '复制链接',
  COMPLETE_TASK: '完成任务',
  REOPEN_TASK: '重新打开任务',
  TOGGLE_DOCUMENT_FAVORITE: '切换收藏',
  CLOSE_RISK: '关闭风险',
}

interface SearchResultItemProps {
  hit: SearchHit
  selected: boolean
  actionPending: boolean
  onSelect: (hit: SearchHit) => void
  onAction: (hit: SearchHit, action: SearchAction) => void
}

export function SearchResultItem({
  hit,
  selected,
  actionPending,
  onSelect,
  onAction,
}: SearchResultItemProps) {
  return (
    <article
      aria-label={`${SEARCH_TYPE_LABELS[hit.type]}：${hit.title}`}
      className={`rounded-xl border p-4 transition-colors ${
        selected
          ? 'border-[var(--semi-color-primary)] bg-[var(--semi-color-primary-light-default)]'
          : 'border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] hover:border-[var(--semi-color-primary-light-active)]'
      }`}
      onMouseEnter={() => onSelect(hit)}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          to={hit.path}
          className="min-w-0 flex-1 cursor-pointer text-left"
          aria-label={`打开：${hit.title}`}
          onFocus={() => onSelect(hit)}
        >
          <span className="mb-2 flex items-center gap-2">
            <Tag color="blue" size="small">
              {SEARCH_TYPE_LABELS[hit.type]}
            </Tag>
            <span className="text-xs text-[var(--semi-color-text-2)]">
              {new Date(hit.updatedAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
          </span>
          <strong className="block truncate text-base text-[var(--semi-color-text-0)]">
            <SearchHighlight text={hit.title} field="title" matches={hit.matches} />
          </strong>
          {hit.snippet ? (
            <span className="mt-2 block line-clamp-2 text-sm leading-6 text-[var(--semi-color-text-1)]">
              <SearchHighlight text={hit.snippet} field="snippet" matches={hit.matches} />
            </span>
          ) : null}
        </Link>
        <Link
          to={hit.path}
          className="rounded-md px-2 py-1 text-sm text-[var(--semi-color-primary)] hover:bg-[var(--semi-color-fill-0)]"
          aria-label={`在当前窗口打开：${hit.title}`}
        >
          打开
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 border-t border-[var(--semi-color-border)] pt-3">
        {hit.actions
          .filter((action) => action !== 'OPEN')
          .map((action) => (
            <Button
              key={action}
              size="small"
              theme="borderless"
              type={action === 'CLOSE_RISK' ? 'danger' : 'tertiary'}
              loading={actionPending && action !== 'COPY_LINK'}
              aria-label={`${ACTION_LABELS[action] ?? action}：${hit.title}`}
              onClick={() => onAction(hit, action)}
            >
              {ACTION_LABELS[action] ?? action}
            </Button>
          ))}
      </div>
    </article>
  )
}
