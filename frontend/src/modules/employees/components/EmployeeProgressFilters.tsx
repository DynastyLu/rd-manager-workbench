import { useId } from 'react'
import { Button, DatePicker, Select } from '@douyinfe/semi-ui'
import { EMPLOYEE_WORK_STATUS_LABELS } from '../labels'
import { convertPeriodStart, snapPeriodStart } from '../periods'
import type { EmployeeProgressPeriod, EmployeeWorkStatus } from '../types'
import './employee-progress.less'

export interface EmployeeProgressFilterValue {
  periodType: EmployeeProgressPeriod
  periodStart: string
  department?: string
  projectId?: string
  status?: EmployeeWorkStatus
}

interface EmployeeProgressFiltersProps {
  value: EmployeeProgressFilterValue
  onChange: (value: EmployeeProgressFilterValue) => void
  departmentOptions?: string[]
  projectOptions?: Array<{ id: string; code: string; name: string }>
  showScopeFilters?: boolean
}

const PERIOD_OPTIONS: Array<{ value: EmployeeProgressPeriod; label: string }> = [
  { value: 'WEEK', label: '周' },
  { value: 'MONTH', label: '月' },
]

export function EmployeeProgressFilters({
  value,
  onChange,
  departmentOptions = [],
  projectOptions = [],
  showScopeFilters = true,
}: EmployeeProgressFiltersProps) {
  const idPrefix = useId()

  function switchPeriodType(periodType: EmployeeProgressPeriod) {
    if (periodType === value.periodType) return
    onChange({
      ...value,
      periodType,
      periodStart: convertPeriodStart(value.periodType, periodType, value.periodStart),
    })
  }

  return (
    <div className="employee-progress-filters" aria-label="进展筛选">
      <div className="employee-progress-filters__period" role="group" aria-label="周期类型">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="small"
            theme={value.periodType === option.value ? 'solid' : 'light'}
            type={value.periodType === option.value ? 'primary' : 'tertiary'}
            aria-pressed={value.periodType === option.value}
            onClick={() => switchPeriodType(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <span id={`${idPrefix}-period`} className="workspace-visually-hidden">
        周期起始
      </span>
      <DatePicker
        key={value.periodType}
        aria-labelledby={`${idPrefix}-period`}
        type={value.periodType === 'MONTH' ? 'month' : 'date'}
        format={value.periodType === 'MONTH' ? 'yyyy-MM' : 'yyyy-MM-dd'}
        value={value.periodType === 'MONTH' ? value.periodStart.slice(0, 7) : value.periodStart}
        onChange={(_date, dateString) => {
          const raw = Array.isArray(dateString) ? dateString[0] : dateString
          if (!raw) return
          const parsed =
            value.periodType === 'MONTH'
              ? new Date(`${String(raw).slice(0, 7)}-01T00:00:00`)
              : new Date(`${String(raw).slice(0, 10)}T00:00:00`)
          if (Number.isNaN(parsed.getTime())) return
          onChange({ ...value, periodStart: snapPeriodStart(value.periodType, parsed) })
        }}
      />
      {showScopeFilters ? (
        <>
          <span id={`${idPrefix}-department`} className="workspace-visually-hidden">
            部门
          </span>
          <Select
            aria-labelledby={`${idPrefix}-department`}
            value={value.department || undefined}
            placeholder="全部部门"
            showClear
            filter
            allowCreate
            optionList={departmentOptions.map((department) => ({
              value: department,
              label: department,
            }))}
            onChange={(next) =>
              onChange({ ...value, department: next ? String(next) : undefined })
            }
          />
          <span id={`${idPrefix}-project`} className="workspace-visually-hidden">
            项目
          </span>
          <Select
            aria-labelledby={`${idPrefix}-project`}
            value={value.projectId || undefined}
            placeholder="全部项目"
            showClear
            filter
            optionList={projectOptions.map((project) => ({
              value: project.id,
              label: `${project.code} ${project.name}`,
            }))}
            onChange={(next) => onChange({ ...value, projectId: next ? String(next) : undefined })}
          />
        </>
      ) : null}
      <span id={`${idPrefix}-status`} className="workspace-visually-hidden">
        状态
      </span>
      <Select
        aria-labelledby={`${idPrefix}-status`}
        value={value.status ?? 'ALL'}
        optionList={[
          { value: 'ALL', label: '全部状态' },
          ...Object.entries(EMPLOYEE_WORK_STATUS_LABELS).map(([status, label]) => ({
            value: status,
            label,
          })),
        ]}
        onChange={(next) =>
          onChange({
            ...value,
            status: next === 'ALL' ? undefined : (next as EmployeeWorkStatus),
          })
        }
      />
    </div>
  )
}
