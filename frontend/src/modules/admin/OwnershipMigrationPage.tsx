import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Select, Table, Toast } from '@douyinfe/semi-ui'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { ApiError } from '@/lib/http'
import { tableScrollWidth } from '@/lib/tableScrollWidth'
import {
  analyzeOwnershipMigration,
  applyOwnershipMigration,
  bulkAssignOwnership,
  completeOwnershipMigration,
  getOwnershipMigrationStatus,
  listUnresolvedOwnership,
  listUsers,
} from './api'
import type { AdminUser, OwnershipMigrationRecord } from './types'
import './AdminPages.less'

const PAGE_SIZE = 50

const CONFIDENCE_LABELS: Record<OwnershipMigrationRecord['confidence'], string> = {
  EXACT: '精确匹配',
  UNIQUE_NAME: '唯一姓名',
  AMBIGUOUS: '模糊',
  MISSING: '缺失',
}

export default function OwnershipMigrationPage() {
  const queryClient = useQueryClient()
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>()
  const [cursor, setCursor] = useState<string | undefined>()
  const [unresolved, setUnresolved] = useState<OwnershipMigrationRecord[]>([])
  const [analyzing, setAnalyzing] = useState(false)

  const statusQuery = useQuery({
    queryKey: ['admin', 'ownership-migration', 'status'],
    queryFn: getOwnershipMigrationStatus,
  })

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', 'all'],
    queryFn: () => listUsers({ page: 1, pageSize: 1000 }),
    select: (result) => result.data,
  })

  const unresolvedQuery = useQuery({
    queryKey: ['admin', 'ownership-migration', 'unresolved', cursor],
    queryFn: () => listUnresolvedOwnership(cursor, PAGE_SIZE),
  })

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setAnalyzing(true)
      setUnresolved([])
      const allItems: OwnershipMigrationRecord[] = []
      let currentCursor: string | undefined
      do {
        const batch = await analyzeOwnershipMigration(currentCursor, PAGE_SIZE)
        allItems.push(...batch.items)
        currentCursor = batch.cursor ?? undefined
      } while (currentCursor)
      return allItems
    },
    onSuccess: (items) => {
      setAnalyzing(false)
      Toast.success(`分析完成，共 ${items.length} 条记录`)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ownership-migration'] })
    },
    onError: (error: unknown) => {
      setAnalyzing(false)
      const message = error instanceof ApiError ? error.message : '分析失败'
      Toast.error(message)
    },
  })

  const applyMutation = useMutation({
    mutationFn: () => applyOwnershipMigration(`apply-${Date.now()}`),
    onSuccess: (result) => {
      Toast.success(`已应用 ${result.appliedCount} 条记录`)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ownership-migration'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '应用失败'
      Toast.error(message)
    },
  })

  const completeMutation = useMutation({
    mutationFn: completeOwnershipMigration,
    onSuccess: () => {
      Toast.success('迁移已完成')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ownership-migration'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '完成迁移失败'
      Toast.error(message)
    },
  })

  const bulkAssignMutation = useMutation({
    mutationFn: (assignments: { recordType: string; recordId: string; ownerUserId: string }[]) =>
      bulkAssignOwnership(assignments),
    onSuccess: (result) => {
      Toast.success(`已批量分配 ${result.updatedCount} 条记录`)
      setSelectedRowKeys([])
      setSelectedUserId(undefined)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ownership-migration'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError ? error.message : '批量分配失败'
      Toast.error(message)
    },
  })

  const allUnresolved = useMemo(() => {
    const pageItems = unresolvedQuery.data?.items ?? []
    return [...unresolved, ...pageItems]
  }, [unresolved, unresolvedQuery.data])

  const userOptions = useMemo(() => {
    const users = usersQuery.data ?? []
    return users.map((user: AdminUser) => ({
      value: user.id,
      label: `${user.resourceProfile?.displayName ?? user.username} (${user.username})`,
    }))
  }, [usersQuery.data])

  function handleBulkAssign() {
    if (!selectedUserId || selectedRowKeys.length === 0) return
    const assignments = selectedRowKeys
      .map((key) => {
        const item = allUnresolved.find((r) => r.id === key)
        if (!item) return null
        return {
          recordType: item.recordType,
          recordId: item.recordId,
          ownerUserId: selectedUserId,
        }
      })
      .filter((a): a is { recordType: string; recordId: string; ownerUserId: string } => a !== null)
    bulkAssignMutation.mutate(assignments)
  }

  function handleLoadMore() {
    const nextCursor = unresolvedQuery.data?.cursor
    if (nextCursor) {
      setUnresolved((prev) => [...prev, ...(unresolvedQuery.data?.items ?? [])])
      setCursor(nextCursor)
    }
  }

  const columns = useMemo<ColumnProps<OwnershipMigrationRecord>[]>(
    () => [
      {
        title: '模块',
        dataIndex: 'module',
        render: (value: string) => value,
      },
      {
        title: '记录标题',
        dataIndex: 'title',
        render: (value: string, record: OwnershipMigrationRecord) => (
          <div>
            <div>{value || '未命名'}</div>
            <div style={{ color: 'var(--semi-color-text-2)', fontSize: 12 }}>{record.recordType}</div>
          </div>
        ),
      },
      {
        title: '历史归属人',
        dataIndex: 'legacyOwner',
        render: (value: string) => value || '—',
      },
      {
        title: '建议用户',
        dataIndex: 'suggestedUser',
        render: (user: OwnershipMigrationRecord['suggestedUser']) =>
          user ? `${user.displayName} (${user.username})` : '—',
      },
      {
        title: '置信度',
        dataIndex: 'confidence',
        render: (value: OwnershipMigrationRecord['confidence']) => {
          const color =
            value === 'EXACT'
              ? 'var(--semi-color-success)'
              : value === 'UNIQUE_NAME'
                ? 'var(--semi-color-primary)'
                : value === 'AMBIGUOUS'
                  ? 'var(--semi-color-warning)'
                  : 'var(--semi-color-danger)'
          return (
            <span style={{ color, fontWeight: 600 }}>
              {CONFIDENCE_LABELS[value]}
            </span>
          )
        },
      },
    ],
    [],
  )

  const status = statusQuery.data

  return (
    <section className="admin-page admin-ownership">
      <div className="admin-page__toolbar">
        <div className="admin-ownership__status">
          {status ? (
            <span>
              状态：<strong>{status.isComplete ? '已完成' : status.needsReview > 0 ? '待修正' : '未开始'}</strong>
              {' | '}总计 {status.total} / 已分配 {status.assigned} / 待复核 {status.needsReview}
            </span>
          ) : (
            '加载中...'
          )}
        </div>
        <div className="admin-page__toolbar-spacer" />
        <Button
          theme="light"
          loading={analyzing}
          onClick={() => analyzeMutation.mutate()}
          aria-label="分析归属"
        >
          分析
        </Button>
        <Button
          theme="solid"
          type="primary"
          loading={applyMutation.isPending}
          onClick={() => applyMutation.mutate()}
          aria-label="应用归属分配"
        >
          应用
        </Button>
        <Button
          theme="solid"
          type="tertiary"
          loading={completeMutation.isPending}
          disabled={!status || status.needsReview > 0}
          onClick={() => completeMutation.mutate()}
          aria-label="完成迁移"
        >
          完成
        </Button>
      </div>

      {(status?.needsReview ?? 0) > 0 ? (
        <Banner
          type="warning"
          description={`还有 ${status?.needsReview ?? 0} 条记录需要人工复核，完成全部分配前普通用户无法登录。`}
          className="admin-page__banner"
        />
      ) : null}

      <div className="admin-page__toolbar">
        <Select
          placeholder="选择要分配的用户"
          value={selectedUserId}
          onChange={(value) => setSelectedUserId(value as string)}
          optionList={userOptions}
          style={{ width: 240 }}
          aria-label="选择要分配的用户"
        />
        <Button
          theme="solid"
          type="primary"
          disabled={!selectedUserId || selectedRowKeys.length === 0}
          loading={bulkAssignMutation.isPending}
          onClick={handleBulkAssign}
          aria-label="批量分配"
        >
          批量分配 ({selectedRowKeys.length})
        </Button>
      </div>

      <Table
        className="admin-ownership__table"
        columns={columns}
        dataSource={allUnresolved}
        loading={unresolvedQuery.isLoading}
        rowKey="id"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        scroll={{ x: tableScrollWidth(columns) }}
        pagination={false}
      />

      {unresolvedQuery.data?.cursor ? (
        <div className="admin-ownership__load-more">
          <Button theme="light" onClick={handleLoadMore}>加载更多</Button>
        </div>
      ) : null}

      {allUnresolved.length === 0 && !unresolvedQuery.isLoading ? (
        <p className="admin-page__empty-hint">没有需要复核的归属记录</p>
      ) : null}
    </section>
  )
}
