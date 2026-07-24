import type { FormEvent } from 'react'
import { Input, InputNumber, Select, TextArea } from '@douyinfe/semi-ui'
import type { EmploymentStatus } from '../types'

export interface EmployeeProfileDraft {
  displayName: string
  department: string
  roleTitle: string
  managerName: string
  employmentStatus: EmploymentStatus
  weeklyCapacityHours: number
  developmentGoal: string
  notes: string
}

export interface EmployeeProfileError {
  field: 'displayName' | 'weeklyCapacityHours' | 'form'
  message: string
}

interface EmployeeProfileFormProps {
  disabled?: boolean
  error?: EmployeeProfileError | null
  formId: string
  onChange: (value: EmployeeProfileDraft) => void
  onSubmit: () => void
  value: EmployeeProfileDraft
}

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '在职' },
  { value: 'ON_LEAVE', label: '休假' },
  { value: 'LEFT', label: '离职' },
]

export function EmployeeProfileForm({
  disabled = false,
  error,
  formId,
  onChange,
  onSubmit,
  value,
}: EmployeeProfileFormProps) {
  const errorId = `${formId}-error`
  const nameError = error?.field === 'displayName'
  const capacityError = error?.field === 'weeklyCapacityHours'

  function update<K extends keyof EmployeeProfileDraft>(
    key: K,
    nextValue: EmployeeProfileDraft[K]
  ) {
    onChange({ ...value, [key]: nextValue })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      id={formId}
      className="workspace-modal-form employee-profile-form"
      onSubmit={handleSubmit}
      noValidate
    >
      <label htmlFor="employee-profile-name">
        <span>
          姓名 <b aria-hidden="true">*</b>
        </span>
        <Input
          id="employee-profile-name"
          aria-label="姓名"
          aria-describedby={nameError ? errorId : undefined}
          aria-invalid={nameError ? true : undefined}
          aria-required="true"
          required
          value={value.displayName}
          onChange={(nextValue) => update('displayName', nextValue)}
          placeholder="例如：林晓"
          disabled={disabled}
        />
      </label>

      <div className="workspace-modal-form__grid">
        <label htmlFor="employee-profile-department">
          <span>部门</span>
          <Input
            id="employee-profile-department"
            aria-label="部门"
            value={value.department}
            onChange={(nextValue) => update('department', nextValue)}
            placeholder="例如：研发一组"
            disabled={disabled}
          />
        </label>
        <label htmlFor="employee-profile-role">
          <span>岗位</span>
          <Input
            id="employee-profile-role"
            aria-label="岗位"
            value={value.roleTitle}
            onChange={(nextValue) => update('roleTitle', nextValue)}
            placeholder="例如：研发工程师"
            disabled={disabled}
          />
        </label>
      </div>

      <div className="workspace-modal-form__grid">
        <label htmlFor="employee-profile-manager">
          <span>直属负责人</span>
          <Input
            id="employee-profile-manager"
            aria-label="直属负责人"
            value={value.managerName}
            onChange={(nextValue) => update('managerName', nextValue)}
            placeholder="填写负责人姓名"
            disabled={disabled}
          />
        </label>
        <div className="workspace-modal-form__field">
          <span id="employee-profile-status-label">在职状态</span>
          <Select
            aria-labelledby="employee-profile-status-label"
            value={value.employmentStatus}
            onChange={(nextValue) => update('employmentStatus', nextValue as EmploymentStatus)}
            optionList={EMPLOYMENT_STATUS_OPTIONS}
            disabled={disabled}
          />
        </div>
      </div>

      <label htmlFor="employee-profile-capacity">
        <span>每周可用工时</span>
        <InputNumber
          id="employee-profile-capacity"
          aria-label="每周可用工时"
          aria-describedby={capacityError ? errorId : undefined}
          aria-invalid={capacityError ? true : undefined}
          min={0}
          max={168}
          value={value.weeklyCapacityHours}
          onNumberChange={(nextValue) => update('weeklyCapacityHours', Number(nextValue ?? 0))}
          suffix="小时"
          disabled={disabled}
          style={{ width: '100%' }}
        />
      </label>

      <label htmlFor="employee-profile-development-goal">
        <span>发展目标</span>
        <TextArea
          id="employee-profile-development-goal"
          aria-label="发展目标"
          value={value.developmentGoal}
          onChange={(nextValue) => update('developmentGoal', nextValue)}
          placeholder="记录能力发展方向与阶段目标"
          autosize={{ minRows: 2, maxRows: 4 }}
          disabled={disabled}
        />
      </label>

      <label htmlFor="employee-profile-notes">
        <span>备注</span>
        <TextArea
          id="employee-profile-notes"
          aria-label="备注"
          value={value.notes}
          onChange={(nextValue) => update('notes', nextValue)}
          placeholder="补充需要长期保留的档案信息"
          autosize={{ minRows: 2, maxRows: 4 }}
          disabled={disabled}
        />
      </label>

      {error ? (
        <p id={errorId} role="alert" className="workspace-modal-form__error">
          {error.message}
        </p>
      ) : null}
    </form>
  )
}
