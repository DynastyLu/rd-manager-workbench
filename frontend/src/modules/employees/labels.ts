import type { EmployeeWorkStatus, EmploymentStatus } from './types'

export const EMPLOYEE_WORK_STATUS_LABELS: Record<EmployeeWorkStatus, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  AT_RISK: '有风险',
  BLOCKED: '阻塞',
}

export const EMPLOYEE_WORK_STATUS_COLORS: Record<
  EmployeeWorkStatus,
  'grey' | 'green' | 'blue' | 'red' | 'amber'
> = {
  NOT_STARTED: 'grey',
  IN_PROGRESS: 'green',
  COMPLETED: 'blue',
  AT_RISK: 'amber',
  BLOCKED: 'red',
}

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: '在职',
  ON_LEAVE: '休假',
  LEFT: '离职',
}
