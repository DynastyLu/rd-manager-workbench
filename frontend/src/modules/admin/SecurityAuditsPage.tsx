import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Input,
  Select,
  Table,
  Tag,
} from '@douyinfe/semi-ui'
import { IconSearch } from '@douyinfe/semi-icons'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { tableScrollWidth } from '@/lib/tableScrollWidth'
import { listSecurityAudits } from './api'
import type { SecurityAuditEvent } from './types'
import './AdminPages.less'

const PAGE_SIZE = 20

const EVENT_TYPE_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: '登录成功',
  LOGIN_FAILURE: '登录失败',
  PASSWORD_CHANGED: '修改密码',
  PERMISSION_DENIED: '越权拦截',
  USER_CREATED: '创建用户',
  USER_UPDATED: '更新用户',
  USER_DISABLED: '停用用户',
  ROLE_UPDATED: '更新角色',
  SESSION_REVOKED: '撤销会话',
}

export default function SecurityAuditsPage() {
  const [page, setPage] = useState(1)
  const [username, setUsername] = useState('')
  const [eventType, setEventType] = useState('')
  const [success, setSuccess] = useState<string | undefined>()
  const [appliedFilters, setAppliedFilters] = useState({
    username: '',
    eventType: '',
    success: undefined as string | undefined,
  })

  const auditsQuery = useQuery({
    queryKey: ['admin', 'security-audits', { page, pageSize: PAGE_SIZE, ...appliedFilters }],
    queryFn: () =>
      listSecurityAudits({
        page,
        pageSize: PAGE_SIZE,
        username: appliedFilters.username,
        eventType: appliedFilters.eventType,
        success:
          appliedFilters.success === 'true'
            ? true
            : appliedFilters.success === 'false'
              ? false
              : undefined,
      }),
  })

  function handleSearch() {
    setAppliedFilters({ username, eventType, success })
    setPage(1)
  }

  const columns: ColumnProps<SecurityAuditEvent>[] = [
    {
      title: '时间',
      dataIndex: 'occurredAt',
      width: 160,
      render: (value: string) => new Date(value).toLocaleString('zh-CN'),
    },
    {
      title: '账号',
      dataIndex: 'username',
      width: 140,
      render: (value: string | null) => value || '—',
    },
    {
      title: '事件类型',
      dataIndex: 'eventType',
      width: 120,
      render: (value: string) => EVENT_TYPE_LABELS[value] ?? value,
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 100,
      render: (value: boolean) => (
        <Tag
          color={value ? 'green' : 'red'}
          type="light"
          aria-label={value ? '成功' : '失败'}
        >
          {value ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '失败原因',
      dataIndex: 'failureReason',
      width: 240,
      render: (value: string | null) => value || '—',
    },
    {
      title: 'IP 地址',
      dataIndex: 'ipAddress',
      width: 140,
      render: (value: string | null) => value || '—',
    },
  ]

  const data = auditsQuery.data?.data ?? []
  const meta = auditsQuery.data?.meta
  const resultLabelId = useId()
  const resultSelectId = `${resultLabelId}-select`

  return (
    <section className="admin-page admin-audits">
      <div className="admin-page__toolbar">
        <Input
          prefix={<IconSearch />}
          placeholder="按账号筛选"
          value={username}
          onChange={setUsername}
          aria-label="账号筛选"
        />
        <Input
          placeholder="按事件类型筛选"
          value={eventType}
          onChange={setEventType}
          aria-label="事件类型筛选"
        />
        <div className="workspace-modal-form__field">
          <label id={resultLabelId} htmlFor={resultSelectId} className="admin-field-label">
            结果筛选
          </label>
          <Select
            id={resultSelectId}
            aria-labelledby={resultLabelId}
            placeholder="按结果筛选"
            value={success}
            onChange={(value) => setSuccess(value as string)}
            optionList={[
              { value: 'true', label: '成功' },
              { value: 'false', label: '失败' },
            ]}
            showClear
          />
        </div>
        <Button theme="solid" type="primary" onClick={handleSearch}>
          查询审计
        </Button>
      </div>

      <h2 className="admin-page__heading" aria-level={1}>
        安全审计
      </h2>

      <Table
        className="admin-audits__table"
        columns={columns}
        dataSource={data}
        loading={auditsQuery.isLoading}
        pagination={
          meta
            ? {
                currentPage: meta.page,
                pageSize: meta.pageSize,
                total: meta.total,
                onPageChange: setPage,
              }
            : false
        }
        scroll={{ x: tableScrollWidth(columns) }}
        rowKey="id"
      />
    </section>
  )
}
