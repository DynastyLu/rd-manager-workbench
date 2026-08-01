import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Empty, Input, Modal, Skeleton, Toast } from '@douyinfe/semi-ui'
import { IconSearch } from '@douyinfe/semi-icons'
import { useNavigate } from 'react-router-dom'

import {
  runSearchAction,
  SEARCH_TYPES,
  searchWorkbench,
  type GlobalSearchResult,
  type SearchAction,
  type SearchActionInput,
  type SearchHit,
  type SearchType,
  type SearchWorkbenchParams,
} from '@/modules/workbench/api/search'
import {
  clearRecentSearches,
  loadRecentSearches,
  recordRecentSearch,
  removeRecentSearch,
  type RecentSearch,
} from '@/modules/workbench/search/recentSearches'
import { buildLocalSearchResultLink } from '@/modules/workbench/search/searchLinks'
import { SearchFilters } from '@/modules/workbench/components/search/SearchFilters'
import { SearchResultItem } from '@/modules/workbench/components/search/SearchResultItem'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceSearchParams'
import './SearchPage.less'

const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
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
  EMPLOYEE: '员工',
  EMPLOYEE_WORK: '员工工作',
}

interface SearchRequest {
  params: SearchWorkbenchParams
  recordHistory: boolean
}

interface ActionRequest {
  hit: SearchHit
  input: SearchActionInput
}

function normalizedQuery(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function parseSearchTypes(value: string | null): SearchType[] {
  const allowedTypes = new Set<string>(SEARCH_TYPES)
  return [
    ...new Set(
      (value ?? '').split(',').filter((type): type is SearchType => allowedTypes.has(type))
    ),
  ]
}

function parseSearchPage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function requestSignature(params: SearchWorkbenchParams): string {
  return JSON.stringify([params.query, params.types ?? [], params.page ?? 1])
}

const SEARCH_ACTION_CACHE_KEYS: Partial<Record<SearchType, string[][]>> = {
  TASK: [
    ['my-work'],
    ['tasks'],
    ['task'],
    ['calendar'],
    ['reminders'],
    ['dashboard'],
    ['projects'],
    ['project'],
  ],
  DOCUMENT: [['documents'], ['document'], ['document-versions'], ['project']],
  RISK: [['risks'], ['risk'], ['dashboard'], ['projects'], ['project']],
}

function SearchPreview({ hit }: { hit: SearchHit | null }) {
  if (!hit) {
    return (
      <aside className="search-page__preview search-page__preview--empty">
        选择一条结果后，可在这里查看对象类型、更新时间和可执行操作。
      </aside>
    )
  }

  return (
    <aside className="search-page__preview">
      <p className="search-page__preview-label">快速预览</p>
      <h2 className="search-page__preview-title">{hit.title}</h2>
      <dl className="search-page__preview-list">
        <div>
          <dt>类型</dt>
          <dd>{SEARCH_TYPE_LABELS[hit.type]}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd>
            {new Date(hit.updatedAt).toLocaleString('zh-CN', { hour12: false })}
          </dd>
        </div>
        <div>
          <dt>位置</dt>
          <dd>{hit.path}</dd>
        </div>
      </dl>
    </aside>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const urlState = useWorkspaceSearchParams()
  const { searchParams, update: updateUrl } = urlState
  const urlSnapshot = searchParams.toString()
  const restoredQuery = searchParams.get('q') ?? ''
  const restoredTypes = parseSearchTypes(searchParams.get('types'))
  const searchFieldRef = useRef<HTMLDivElement>(null)
  const lastExecutedSignatureRef = useRef<string | null>(null)
  const [queryDraft, setQueryDraft] = useState({ source: urlSnapshot, value: restoredQuery })
  const [typeDraft, setTypeDraft] = useState({ source: urlSnapshot, value: restoredTypes })
  const query = queryDraft.source === urlSnapshot ? queryDraft.value : restoredQuery
  const selectedTypes = typeDraft.source === urlSnapshot ? typeDraft.value : restoredTypes
  const setQuery = (value: string) => setQueryDraft({ source: urlSnapshot, value })
  const setSelectedTypes = (value: SearchType[]) => setTypeDraft({ source: urlSnapshot, value })
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(loadRecentSearches)
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null)
  const [lastRequest, setLastRequest] = useState<SearchWorkbenchParams | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [riskToClose, setRiskToClose] = useState<SearchHit | null>(null)

  const searchMutation = useMutation<GlobalSearchResult, Error, SearchRequest>({
    mutationFn: ({ params }) => searchWorkbench(params),
    onSuccess: (data, request) => {
      setSelectedHit(data.data[0] ?? null)
      if (request.recordHistory) {
        setRecentSearches(
          recordRecentSearch({ query: request.params.query, types: request.params.types ?? [] })
        )
      }
    },
  })
  const mutateSearch = searchMutation.mutate
  const resetSearch = searchMutation.reset

  const actionMutation = useMutation<SearchHit, Error, ActionRequest>({
    mutationFn: ({ hit, input }) => runSearchAction(hit.type, hit.id, input),
    onSuccess: async (updatedHit, request) => {
      setSelectedHit(updatedHit)
      setRiskToClose(null)
      Toast.success('操作已完成')
      await Promise.all(
        (SEARCH_ACTION_CACHE_KEYS[request.hit.type] ?? []).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
      if (lastRequest) mutateSearch({ params: lastRequest, recordHistory: false })
    },
    onError: () => Toast.error('操作失败，搜索结果没有被修改。'),
  })

  function focusSearchField() {
    searchFieldRef.current?.querySelector('input')?.focus()
  }

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        focusSearchField()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    window.addEventListener('rd-workbench:focus-search', focusSearchField)
    return () => {
      window.removeEventListener('keydown', handleShortcut)
      window.removeEventListener('rd-workbench:focus-search', focusSearchField)
    }
  }, [])

  const executeSearch = useCallback(
    (input: string, types: SearchType[], recordHistory: boolean, page = 1) => {
      const normalized = normalizedQuery(input)
      if (Array.from(normalized).length < 2) {
        setValidationMessage('请输入至少 2 个字符。')
        focusSearchField()
        return
      }
      setValidationMessage(null)
      const params: SearchWorkbenchParams = {
        query: normalized,
        types,
        page,
        pageSize: 20,
      }
      updateUrl(
        { q: normalized, types: types.length ? types.join(',') : undefined, page },
        { defaults: { page: 1 } },
      )
      lastExecutedSignatureRef.current = requestSignature(params)
      setLastRequest(params)
      mutateSearch({ params, recordHistory })
    },
    [mutateSearch, updateUrl]
  )

  useEffect(() => {
    const urlQuery = searchParams.get('q') ?? ''
    const urlTypes = parseSearchTypes(searchParams.get('types'))
    const urlPage = parseSearchPage(searchParams.get('page'))
    const normalized = normalizedQuery(urlQuery)
    const timer = window.setTimeout(() => {
      if (Array.from(normalized).length < 2) {
        if (lastExecutedSignatureRef.current) {
          lastExecutedSignatureRef.current = null
          setLastRequest(null)
          setSelectedHit(null)
          resetSearch()
        }
        return
      }

      const params: SearchWorkbenchParams = {
        query: normalized,
        types: urlTypes,
        page: urlPage,
        pageSize: 20,
      }
      const signature = requestSignature(params)
      if (lastExecutedSignatureRef.current === signature) return
      lastExecutedSignatureRef.current = signature
      setLastRequest(params)
      mutateSearch({ params, recordHistory: false })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [mutateSearch, resetSearch, searchParams])

  useEffect(() => {
    const normalized = normalizedQuery(query)
    if (Array.from(normalized).length < 2) return
    const pendingRequest: SearchWorkbenchParams = {
      query: normalized,
      types: selectedTypes,
      page: 1,
      pageSize: 20,
    }
    const signature = requestSignature(pendingRequest)
    const timer = window.setTimeout(() => {
      if (lastExecutedSignatureRef.current !== signature) {
        executeSearch(query, selectedTypes, false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [executeSearch, query, selectedTypes])

  function openRecent(recent: RecentSearch) {
    setQuery(recent.query)
    setSelectedTypes(recent.types)
    executeSearch(recent.query, recent.types, true)
  }

  function changeSearchTypes(types: SearchType[]) {
    setSelectedTypes(types)
    if (Array.from(normalizedQuery(query)).length >= 2) executeSearch(query, types, false)
  }

  function clearSearchState() {
    setSelectedTypes([])
    setSelectedHit(null)
    setLastRequest(null)
    setValidationMessage(null)
    lastExecutedSignatureRef.current = null
    updateUrl({ q: undefined, types: undefined, page: undefined })
    searchMutation.reset()
  }

  async function copyResultLink(hit: SearchHit) {
    try {
      await navigator.clipboard.writeText(buildLocalSearchResultLink(window.location.href, hit.path))
      Toast.success('链接已复制')
    } catch {
      Toast.error('复制失败，请手动打开该结果。')
    }
  }

  function runResultAction(hit: SearchHit, action: SearchAction) {
    if (action === 'OPEN') {
      void navigate(hit.path)
      return
    }
    if (action === 'COPY_LINK') {
      void copyResultLink(hit)
      return
    }
    if (action === 'CLOSE_RISK') {
      setRiskToClose(hit)
      return
    }
    actionMutation.mutate({ hit, input: { action } })
  }

  const result = searchMutation.data
  const showRecent = !lastRequest && query.length === 0

  return (
    <div className="search-page workspace-page">
      <div className="search-page__inner workspace-page__inner">
        <header className="search-page__header">
          <div>
            <h1>全局搜索</h1>
            <p>在一个入口找到项目、任务、文档、会议与业务记录。</p>
          </div>
          <span className="search-page__shortcut">
            ⌘K / Ctrl K
          </span>
        </header>

        <section className="workspace-card search-page__surface">
          <form
            className="search-page__form"
            onSubmit={(event) => {
              event.preventDefault()
              executeSearch(query, selectedTypes, true)
            }}
          >
            <div ref={searchFieldRef} className="search-page__field">
              <Input
                size="large"
                showClear
                composition
                prefix={<IconSearch />}
                aria-label="搜索全部工作内容"
                placeholder="搜索项目、任务、文档、会议……"
                value={query}
                onChange={(value) => {
                  setQuery(value)
                  if (normalizedQuery(value).length === 0) clearSearchState()
                }}
                onClear={() => {
                  setQuery('')
                  clearSearchState()
                }}
              />
            </div>
            <Button
              htmlType="submit"
              theme="solid"
              type="primary"
              size="large"
              loading={searchMutation.isPending}
            >
              搜索
            </Button>
          </form>
          {validationMessage ? (
            <p className="search-page__validation" role="alert">
              {validationMessage}
            </p>
          ) : null}
          <div className="search-page__filters">
            <SearchFilters
              selectedTypes={selectedTypes}
              groups={result?.groups}
              onChange={changeSearchTypes}
            />
          </div>
        </section>

        {showRecent ? (
          <section className="search-page__recent" aria-labelledby="recent-search-heading">
            <div className="search-page__section-header">
              <h2 id="recent-search-heading">
                最近搜索
              </h2>
              {recentSearches.length ? (
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => {
                    clearRecentSearches()
                    setRecentSearches([])
                  }}
                >
                  清空
                </Button>
              ) : null}
            </div>
            {recentSearches.length ? (
              <div className="search-page__recent-grid">
                {recentSearches.map((recent) => (
                  <div
                    key={`${recent.query}:${recent.types.join(',')}`}
                    className="search-page__recent-card"
                  >
                    <button
                      type="button"
                      className="search-page__recent-query"
                      aria-label={`再次搜索：${recent.query}`}
                      onClick={() => openRecent(recent)}
                    >
                      <strong>{recent.query}</strong>
                      <span>
                        {recent.types.length
                          ? recent.types.map((type) => SEARCH_TYPE_LABELS[type]).join('、')
                          : '全部内容'}
                        {' · '}
                        使用 {recent.useCount} 次
                      </span>
                    </button>
                    <Button
                      size="small"
                      theme="borderless"
                      aria-label={`删除最近搜索：${recent.query}`}
                      onClick={() => setRecentSearches(removeRecentSearch(recent))}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="还没有最近搜索" description="提交一次搜索后会保存在本机。" />
            )}
          </section>
        ) : null}

        {searchMutation.isPending ? (
          <section
            className="search-page__status"
            role="status"
            aria-label="搜索状态"
            aria-live="polite"
          >
            <span className="sr-only">正在搜索</span>
            <Skeleton.Paragraph rows={4} />
          </section>
        ) : null}

        {searchMutation.isError ? (
          <section className="search-page__feedback">
            <Banner
              type="danger"
              fullMode={false}
              title="无法完成搜索"
              description="请确认本地服务已启动，然后重试上一次搜索。"
            />
            <Button
              className="search-page__retry"
              onClick={() => {
                if (lastRequest)
                  searchMutation.mutate({ params: lastRequest, recordHistory: false })
              }}
            >
              重试搜索
            </Button>
          </section>
        ) : null}

        {result && result.partialFailures.length > 0 ? (
          <section className="search-page__feedback">
            <Banner
              type="warning"
              fullMode={false}
              title="部分结果暂时不可用"
              description={result.partialFailures.map((failure) => failure.message).join('；')}
            />
            <Button
              className="search-page__retry"
              aria-label="重试未完成的类型"
              onClick={() => {
                if (lastRequest) mutateSearch({ params: lastRequest, recordHistory: false })
              }}
            >
              重试未完成的类型
            </Button>
          </section>
        ) : null}

        {result && !searchMutation.isPending && result.data.length === 0 ? (
          <section className="search-page__empty">
            <Empty title="没有找到相关内容" description="尝试缩短关键词或切换搜索分类。" />
          </section>
        ) : null}

        {result && result.data.length > 0 ? (
          <section className="search-page__results">
            <div className="search-page__results-main">
              <div className="search-page__section-header">
                <h2>搜索结果</h2>
                <span className="search-page__count">
                  共 {result.meta.total} 条
                </span>
              </div>
              <div className="search-page__hits">
                {result.data.map((hit) => (
                  <SearchResultItem
                    key={`${hit.type}:${hit.id}`}
                    hit={hit}
                    selected={selectedHit?.type === hit.type && selectedHit.id === hit.id}
                    actionPending={
                      actionMutation.isPending && actionMutation.variables?.hit.id === hit.id
                    }
                    onSelect={setSelectedHit}
                    onAction={runResultAction}
                  />
                ))}
              </div>
              {result.meta.total > result.meta.pageSize ? (
                <nav className="search-page__pagination" aria-label="搜索结果分页">
                  <Button
                    aria-label="上一页搜索结果"
                    disabled={result.meta.page <= 1 || searchMutation.isPending}
                    onClick={() =>
                      executeSearch(query, selectedTypes, false, result.meta.page - 1)
                    }
                  >
                    上一页
                  </Button>
                  <span className="search-page__page-info">
                    第 {result.meta.page} / {Math.ceil(result.meta.total / result.meta.pageSize)} 页
                  </span>
                  <Button
                    aria-label="下一页搜索结果"
                    disabled={
                      searchMutation.isPending ||
                      result.meta.page * result.meta.pageSize >= result.meta.total
                    }
                    onClick={() =>
                      executeSearch(query, selectedTypes, false, result.meta.page + 1)
                    }
                  >
                    下一页
                  </Button>
                </nav>
              ) : null}
            </div>
            <SearchPreview hit={selectedHit} />
          </section>
        ) : null}
      </div>

      <Modal
        title="确认关闭风险"
        visible={riskToClose !== null}
        onCancel={() => setRiskToClose(null)}
        closeOnEsc
        footer={
          <div className="workspace-modal-footer">
            <Button onClick={() => setRiskToClose(null)}>取消</Button>
            <Button
              theme="solid"
              type="danger"
              loading={actionMutation.isPending}
              onClick={() => {
                if (riskToClose) {
                  actionMutation.mutate({
                    hit: riskToClose,
                    input: { action: 'CLOSE_RISK', confirm: true },
                  })
                }
              }}
            >
              确认关闭
            </Button>
          </div>
        }
      >
        <p>关闭“{riskToClose?.title}”后将写入关闭时间和审计记录。</p>
      </Modal>
    </div>
  )
}
