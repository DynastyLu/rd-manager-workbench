import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, Empty, Table, Tag } from '@douyinfe/semi-ui'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { ROUTES } from '@/constants/routes'
import { percentage } from '../format'
import { EMPLOYEE_WORK_STATUS_COLORS, EMPLOYEE_WORK_STATUS_LABELS } from '../labels'
import type { EmployeeWorkItem } from '../types'
import './employee-progress.less'

const WORK_KIND_LABELS = {
  PROJECT: '项目工作',
  NON_PROJECT: '非项目工作',
} as const

const hours = (item: EmployeeWorkItem) => {
  if (item.plannedHours === null && item.actualHours === null) return '暂无数据'
  return `${item.plannedHours ?? '—'} / ${item.actualHours ?? '—'}`
}

interface EmployeeWorkTableProps {
  items: EmployeeWorkItem[]
  showEmployee?: boolean
  focusedWorkItemId?: string
  onConvertRisk?: (item: EmployeeWorkItem) => void
  onEdit?: (item: EmployeeWorkItem) => void
  convertingWorkItemId?: string | null
  pagination?: false | Record<string, unknown>
}

export function EmployeeWorkTable({
  items,
  showEmployee = false,
  focusedWorkItemId,
  onConvertRisk,
  onEdit,
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
      title: '工作类型',
      dataIndex: 'workKind',
      width: 112,
      render: (_value, item) =>
        item.classificationState === 'LEGACY_UNCLASSIFIED' || !item.workKind ? (
          <Tag size="small" color="grey">
            历史未分类
          </Tag>
        ) : (
          <Tag size="small" color={item.workKind === 'PROJECT' ? 'blue' : 'cyan'}>
            {WORK_KIND_LABELS[item.workKind]}
          </Tag>
        ),
    },
    {
      title: '项目 / 任务',
      dataIndex: 'project',
      width: 220,
      render: (_value, item) => (
        <div className="employee-work-table__reference">
          {item.project ? (
            <Link to={ROUTES.projectWorkspace(item.project.id, 'overview')}>
              {item.project.code} {item.project.name}
            </Link>
          ) : (
            <span className="employee-work-table__muted">未关联项目</span>
          )}
          {item.task && item.project ? (
            <Link to={ROUTES.projectWorkspace(item.project.id, 'work-items')}>
              {item.task.code} {item.task.title}
            </Link>
          ) : null}
        </div>
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
      title: '计划完成日',
      dataIndex: 'plannedCompletionDate',
      width: 118,
      render: (_value, item) => (
        <div className="employee-work-table__deadline">
          <span>{item.plannedCompletionDate || '未设置'}</span>
          {item.overdue ? (
            <Tag size="small" color="red">
              已逾期
            </Tag>
          ) : null}
        </div>
      ),
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
      dataIndex: 'source',
      width: 220,
      render: (_value, item) =>
        item.source?.label ||
        `v${item.importVersion ?? '—'} · 第 ${item.sourceRowNumber} 行`,
    },
    ...(onConvertRisk || onEdit
      ? [
          {
            title: '操作',
            dataIndex: 'id',
            width: 130,
            fixed: 'right' as const,
            render: (_value: unknown, item: EmployeeWorkItem) => {
              return (
                <div className="employee-work-table__actions">
                  {onEdit ? (
                    <Button
                      size="small"
                      theme="borderless"
                      onClick={() => onEdit(item)}
                    >
                      编辑
                    </Button>
                  ) : null}
                  {onConvertRisk && item.riskId ? <Tag size="small">已转风险</Tag> : null}
                  {onConvertRisk && !item.riskId && item.riskText && item.project ? (
                    <Button
                      size="small"
                      theme="borderless"
                      type="primary"
                      loading={convertingWorkItemId === item.id}
                      onClick={() => onConvertRisk(item)}
                    >
                      转为项目风险
                    </Button>
                  ) : null}
                </div>
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
        scroll={{ x: 1580 }}
        onRow={(record) => ({
          className:
            record && record.id === focusedWorkItemId ? 'employee-work-table__row--focused' : '',
        })}
        empty={<Empty title="当前周期没有工作记录" description="调整周期或筛选条件后重试。" />}
      />
    </div>
  )
}
