import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, Empty, Table, Tag } from '@douyinfe/semi-ui'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { ROUTES } from '@/constants/routes'
import { tableScrollWidth } from '@/lib/tableScrollWidth'
import type { EmployeeWeekPlan } from '../types'
import './employee-progress.less'

const PRIORITY_LABELS = {
  UNSPECIFIED: '未指定',
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
} as const

const PRIORITY_COLORS = {
  UNSPECIFIED: 'grey',
  LOW: 'cyan',
  MEDIUM: 'blue',
  HIGH: 'amber',
  URGENT: 'red',
} as const

const CARRY_STATUS_LABELS = {
  PLANNED: '待承接',
  MATCHED: '已承接',
  CANCELLED: '已取消',
} as const

interface EmployeeWeekPlanTableProps {
  plans: EmployeeWeekPlan[]
  showEmployee?: boolean
  focusedPlanId?: string
  pagination?: false | Record<string, unknown>
  pendingPlanId?: string | null
  onEdit?: (plan: EmployeeWeekPlan) => void
  onCancel?: (plan: EmployeeWeekPlan) => void
  onMatch?: (plan: EmployeeWeekPlan) => void
  onUnmatch?: (plan: EmployeeWeekPlan) => void
  onConvertToTask?: (plan: EmployeeWeekPlan) => void
}

export function EmployeeWeekPlanTable({
  plans,
  showEmployee = false,
  focusedPlanId,
  pagination = false,
  pendingPlanId,
  onEdit,
  onCancel,
  onMatch,
  onUnmatch,
  onConvertToTask,
}: EmployeeWeekPlanTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hasActions = Boolean(onEdit || onCancel || onMatch || onUnmatch || onConvertToTask)

  useEffect(() => {
    if (!focusedPlanId) return
    const row = containerRef.current?.querySelector('.employee-week-plan-table__row--focused')
    row?.scrollIntoView?.({ block: 'center' })
  }, [focusedPlanId, plans])

  const columns: ColumnProps<EmployeeWeekPlan>[] = [
    {
      title: '计划事项',
      dataIndex: 'title',
      width: 260,
      render: (_value, plan) => (
        <div className="employee-work-table__title">
          <strong>{plan.title}</strong>
          {plan.deliverableText ? <small>{plan.deliverableText}</small> : null}
          {plan.planText ? <small>计划：{plan.planText}</small> : null}
          {plan.note ? <small>备注：{plan.note}</small> : null}
        </div>
      ),
    },
    ...(showEmployee
      ? [
          {
            title: '员工',
            dataIndex: 'employeeName',
            width: 120,
            render: (_value: unknown, plan: EmployeeWeekPlan) => (
              <Link to={ROUTES.employeeDetail(plan.employeeId)}>{plan.employeeName}</Link>
            ),
          } satisfies ColumnProps<EmployeeWeekPlan>,
        ]
      : []),
    {
      title: '类型',
      dataIndex: 'workKind',
      width: 100,
      render: (value: EmployeeWeekPlan['workKind']) => (
        <Tag size="small" color={value === 'PROJECT' ? 'blue' : 'cyan'}>
          {value === 'PROJECT' ? '项目工作' : '非项目工作'}
        </Tag>
      ),
    },
    {
      title: '项目 / 任务',
      dataIndex: 'project',
      width: 230,
      render: (_value, plan) => (
        <div className="employee-work-table__reference">
          {plan.project ? (
            <Link to={ROUTES.projectWorkspace(plan.project.id, 'overview')}>
              {plan.project.code} {plan.project.name}
            </Link>
          ) : (
            <span className="employee-work-table__muted">无项目</span>
          )}
          {plan.task && plan.project ? (
            <Link to={ROUTES.projectWorkspace(plan.project.id, 'work-items')}>
              {plan.task.code} {plan.task.title}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 88,
      render: (value: EmployeeWeekPlan['priority']) => (
        <Tag size="small" color={PRIORITY_COLORS[value]}>
          {PRIORITY_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: '计划完成日',
      dataIndex: 'plannedCompletionDate',
      width: 112,
      render: (value: string | null) => value || '未设置',
    },
    {
      title: '协作需求',
      dataIndex: 'collaborationText',
      width: 180,
      render: (value: string | null) =>
        value || <span className="employee-work-table__muted">无</span>,
    },
    {
      title: '承接状态',
      dataIndex: 'carryStatus',
      width: 100,
      render: (value: EmployeeWeekPlan['carryStatus']) => (
        <Tag
          size="small"
          color={value === 'MATCHED' ? 'green' : value === 'CANCELLED' ? 'grey' : 'amber'}
        >
          {CARRY_STATUS_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 220,
      render: (_value, plan) => plan.source.label,
    },
    ...(hasActions
      ? [
          {
            title: '操作',
            dataIndex: 'id',
            fixed: 'right' as const,
            width: 320,
            render: (_value: unknown, plan: EmployeeWeekPlan) => (
              <div className="employee-week-plan-table__actions">
                {onEdit && plan.carryStatus !== 'CANCELLED' ? (
                  <Button size="small" theme="borderless" onClick={() => onEdit(plan)}>
                    编辑系统字段
                  </Button>
                ) : null}
                {plan.carryStatus === 'PLANNED' && onMatch ? (
                  <Button size="small" theme="borderless" onClick={() => onMatch(plan)}>
                    承接
                  </Button>
                ) : null}
                {plan.carryStatus === 'MATCHED' && onUnmatch ? (
                  <Button size="small" theme="borderless" onClick={() => onUnmatch(plan)}>
                    撤销承接
                  </Button>
                ) : null}
                {plan.workKind === 'PROJECT' && !plan.task && plan.carryStatus !== 'CANCELLED' && onConvertToTask ? (
                  <Button
                    size="small"
                    theme="borderless"
                    loading={pendingPlanId === plan.id}
                    onClick={() => onConvertToTask(plan)}
                  >
                    转任务
                  </Button>
                ) : null}
                {plan.carryStatus !== 'CANCELLED' && onCancel ? (
                  <Button
                    size="small"
                    theme="borderless"
                    type="danger"
                    onClick={() => onCancel(plan)}
                  >
                    取消计划
                  </Button>
                ) : null}
              </div>
            ),
          } satisfies ColumnProps<EmployeeWeekPlan>,
        ]
      : []),
  ]

  return (
    <div ref={containerRef} className="employee-week-plan-table">
      <Table<EmployeeWeekPlan>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={plans}
        pagination={pagination}
        scroll={{ x: tableScrollWidth(columns) }}
        onRow={(record) => ({
          className:
            record && record.id === focusedPlanId
              ? 'employee-week-plan-table__row--focused'
              : '',
        })}
        empty={<Empty title="下周暂无计划" description="提交 V2 周报后，未来计划会显示在这里。" />}
      />
    </div>
  )
}
