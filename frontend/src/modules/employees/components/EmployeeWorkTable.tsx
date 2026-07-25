import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, Empty, Table, Tag } from '@douyinfe/semi-ui'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { ROUTES } from '@/constants/routes'
import { EMPLOYEE_WORK_STATUS_COLORS, EMPLOYEE_WORK_STATUS_LABELS } from '../labels'
import type { EmployeeWorkItem } from '../types'
import './employee-progress.less'

const percentage = (value: number | null) => (value === null ? '暂无数据' : `${value}%`)

const hours = (item: EmployeeWorkItem) => {
  if (item.plannedHours === null && item.actualHours === null) return '暂无数据'
  return `${item.plannedHours ?? '—'} / ${item.actualHours ?? '—'}`
}

interface EmployeeWorkTableProps {
  items: EmployeeWorkItem[]
  showEmployee?: boolean
  focusedWorkItemId?: string
  onConvertRisk?: (item: EmployeeWorkItem) => void
  convertingWorkItemId?: string | null
  pagination?: false | Record<string, unknown>
}

export function EmployeeWorkTable({
  items,
  showEmployee = false,
  focusedWorkItemId,
  onConvertRisk,
  convertingWorkItemId,
  pagination = false,
}: EmployeeWorkTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusedWorkItemId) return
    const row = containerRef.current?.querySelector('.employee-work-table__row--focused')
    row?.scrollIntoView?.({ block: 'center' })
  }, [focusedWorkItemId, items])

  const columns: ColumnProps<EmployeeWorkItem>[] = [
    {
      title: '工作事项',
      dataIndex: 'title',
      width: 240,
      render: (_value, item) => (
        <div className="employee-work-table__title">
          <strong>{item.title}</strong>
          {item.summaryText ? <small>{item.summaryText}</small> : null}
        </div>
      ),
    },
    ...(showEmployee
      ? [
          {
            title: '员工',
            dataIndex: 'employeeName',
            width: 120,
            render: (_value: unknown, item: EmployeeWorkItem) => (
              <Link to={ROUTES.employeeDetail(item.employeeId)}>{item.employeeName}</Link>
            ),
          } satisfies ColumnProps<EmployeeWorkItem>,
        ]
      : []),
    {
      title: '项目',
      dataIndex: 'project',
      width: 190,
      render: (_value, item) =>
        item.project ? (
          <Link to={ROUTES.projectWorkspace(item.project.id, 'overview')}>
            {item.project.code} {item.project.name}
          </Link>
        ) : (
          <span className="employee-work-table__muted">未关联项目</span>
        ),
    },
    {
      title: '任务',
      dataIndex: 'task',
      width: 190,
      render: (_value, item) =>
        item.task && item.project ? (
          <Link to={ROUTES.projectWorkspace(item.project.id, 'work-items')}>
            {item.task.code} {item.task.title}
          </Link>
        ) : (
          <span className="employee-work-table__muted">—</span>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: EmployeeWorkItem['status']) => (
        <Tag size="small" color={EMPLOYEE_WORK_STATUS_COLORS[value]}>
          {EMPLOYEE_WORK_STATUS_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: '完成度',
      dataIndex: 'completionRate',
      width: 90,
      render: (value: number | null) => percentage(value),
    },
    {
      title: '工时(计划/实际)',
      dataIndex: 'plannedHours',
      width: 130,
      render: (_value, item) => hours(item),
    },
    {
      title: '下步计划',
      dataIndex: 'nextPlanText',
      width: 170,
      render: (value: string | null) => value || '—',
    },
    {
      title: '风险',
      dataIndex: 'riskText',
      width: 170,
      render: (value: string | null) =>
        value || <span className="employee-work-table__muted">—</span>,
    },
    {
      title: '来源',
      dataIndex: 'sourceRowNumber',
      width: 120,
      render: (_value, item) => `v${item.importVersion ?? '—'} · 第 ${item.sourceRowNumber} 行`,
    },
    ...(onConvertRisk
      ? [
          {
            title: '操作',
            dataIndex: 'id',
            width: 130,
            fixed: 'right' as const,
            render: (_value: unknown, item: EmployeeWorkItem) => {
              if (item.riskId) return <Tag size="small">已转风险</Tag>
              if (!item.riskText || !item.project) return null
              return (
                <Button
                  size="small"
                  theme="borderless"
                  type="primary"
                  loading={convertingWorkItemId === item.id}
                  onClick={() => onConvertRisk(item)}
                >
                  转为项目风险
                </Button>
              )
            },
          } satisfies ColumnProps<EmployeeWorkItem>,
        ]
      : []),
  ]

  return (
    <div ref={containerRef} className="employee-work-table">
      <Table<EmployeeWorkItem>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={items}
        pagination={pagination}
        scroll={{ x: 1500 }}
        onRow={(record) => ({
          className:
            record && record.id === focusedWorkItemId ? 'employee-work-table__row--focused' : '',
        })}
        empty={<Empty title="当前周期没有工作记录" description="调整周期或筛选条件后重试。" />}
      />
    </div>
  )
}
