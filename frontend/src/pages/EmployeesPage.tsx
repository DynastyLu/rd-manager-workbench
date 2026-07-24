import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banner,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  TabPane,
  Table,
  Tabs,
  Tag,
} from '@douyinfe/semi-ui'
import { IconPlus, IconSearch } from '@douyinfe/semi-icons'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ROUTES } from '@/constants/routes'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceSearchParams'
import {
  archiveEmployee,
  createEmployee,
  listEmployees,
  updateEmployee,
} from '@/modules/employees/api'
import {
  EmployeeProfileForm,
  type EmployeeProfileDraft,
  type EmployeeProfileError,
} from '@/modules/employees/components/EmployeeProfileForm'
import { EmployeeImportHistory } from '@/modules/employees/components/EmployeeImportHistory'
import { EmployeeImportWizard } from '@/modules/employees/components/EmployeeImportWizard'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeFilters,
  EmploymentStatus,
  UpdateEmployeeInput,
} from '@/modules/employees/types'
import './EmployeesPage.less'

type EmployeeWorkspaceTab = 'overview' | 'directory' | 'work-items' | 'imports'
type EmployeeEditor = { mode: 'create' } | { mode: 'edit'; employee: Employee }

const PAGE_SIZE = 20
const EMPLOYMENT_STATUS_OPTIONS: Array<{ value: EmploymentStatus; label: string }> = [
  { value: 'ACTIVE', label: '在职' },
  { value: 'ON_LEAVE', label: '休假' },
  { value: 'LEFT', label: '离职' },
]
const EMPLOYMENT_STATUS_COLORS: Record<EmploymentStatus, 'green' | 'amber' | 'grey'> = {
  ACTIVE: 'green',
  ON_LEAVE: 'amber',
  LEFT: 'grey',
}
const EMPTY_DRAFT: EmployeeProfileDraft = {
  displayName: '',
  department: '',
  roleTitle: '',
  managerName: '',
  employmentStatus: 'ACTIVE',
  weeklyCapacityHours: 40,
  developmentGoal: '',
  notes: '',
}

function employeeToDraft(employee: Employee): EmployeeProfileDraft {
  return {
    displayName: employee.displayName,
    department: employee.department ?? '',
    roleTitle: employee.roleTitle ?? '',
    managerName: employee.managerName ?? '',
    employmentStatus: employee.employmentStatus,
    weeklyCapacityHours: employee.weeklyCapacityHours,
    developmentGoal: employee.developmentGoal ?? '',
    notes: employee.notes ?? '',
  }
}

function draftToCreateInput(draft: EmployeeProfileDraft): CreateEmployeeInput {
  const optional = (value: string) => value.trim() || undefined
  return {
    displayName: draft.displayName.trim(),
    department: optional(draft.department),
    roleTitle: optional(draft.roleTitle),
    managerName: optional(draft.managerName),
    employmentStatus: draft.employmentStatus,
    weeklyCapacityHours: draft.weeklyCapacityHours,
    developmentGoal: optional(draft.developmentGoal),
    notes: optional(draft.notes),
  }
}

function draftToUpdateInput(draft: EmployeeProfileDraft): UpdateEmployeeInput {
  return {
    displayName: draft.displayName.trim(),
    department: draft.department.trim(),
    roleTitle: draft.roleTitle.trim(),
    managerName: draft.managerName.trim(),
    employmentStatus: draft.employmentStatus,
    weeklyCapacityHours: draft.weeklyCapacityHours,
    developmentGoal: draft.developmentGoal.trim(),
    notes: draft.notes.trim(),
  }
}

function employmentStatusLabel(status: EmploymentStatus) {
  return EMPLOYMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function PlannedTabState({ title, description }: { title: string; description: string }) {
  return (
    <div className="employees-page__planned">
      <Empty title={title} description={description} />
    </div>
  )
}

export default function EmployeesPage() {
  const queryClient = useQueryClient()
  const searchParams = useWorkspaceSearchParams()
  const updateSearchParams = searchParams.update
  const tab = searchParams.getEnum(
    'tab',
    ['overview', 'directory', 'work-items', 'imports'] as const,
    'directory'
  ) as EmployeeWorkspaceTab
  const search = searchParams.getString('query')
  const department = searchParams.getString('department')
  const statusParam = searchParams.getEnum(
    'employmentStatus',
    ['ALL', 'ACTIVE', 'ON_LEAVE', 'LEFT'] as const,
    'ALL'
  )
  const employmentStatus = statusParam === 'ALL' ? undefined : statusParam
  const page = searchParams.getPositiveInt('page', 1)
  const [editor, setEditor] = useState<EmployeeEditor | null>(null)
  const [draft, setDraft] = useState<EmployeeProfileDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<EmployeeProfileError | null>(null)
  const [searchDraft, setSearchDraft] = useState(search)
  const [importWizardOpen, setImportWizardOpen] = useState(false)

  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  useEffect(() => {
    const nextSearch = searchDraft.trim()
    if (nextSearch === search) return

    const timeout = window.setTimeout(() => {
      updateSearchParams({ query: nextSearch || undefined, page: 1 }, { defaults: { page: 1 } })
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [search, searchDraft, updateSearchParams])

  const filters: EmployeeFilters = {
    q: search || undefined,
    department: department || undefined,
    employmentStatus,
    page,
    pageSize: PAGE_SIZE,
  }
  const employeesQuery = useQuery({
    queryKey: employeeQueryKeys.list(filters),
    queryFn: () => listEmployees(filters),
    enabled: tab === 'directory',
  })

  async function invalidateEmployeeWorkspace() {
    await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.all })
  }

  const createMutation = useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    onSuccess: async () => {
      await invalidateEmployeeWorkspace()
      setEditor(null)
      toast.success('员工档案已创建')
    },
    onError: (error) => {
      setFormError({
        field: 'form',
        message: error instanceof Error ? error.message : '创建员工失败，请重试。',
      })
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ employeeId, input }: { employeeId: string; input: UpdateEmployeeInput }) =>
      updateEmployee(employeeId, input),
    onSuccess: async () => {
      await invalidateEmployeeWorkspace()
      setEditor(null)
      toast.success('员工档案已更新')
    },
    onError: (error) => {
      setFormError({
        field: 'form',
        message: error instanceof Error ? error.message : '更新员工失败，请重试。',
      })
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (employeeId: string) => archiveEmployee(employeeId),
    onSuccess: async () => {
      await invalidateEmployeeWorkspace()
      toast.success('员工已归档')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '归档员工失败，请重试。')
    },
  })

  const employees = useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data?.data])
  const departmentOptions = useMemo(() => {
    const values = new Set(
      employees.flatMap((employee) => (employee.department ? [employee.department] : []))
    )
    if (department) values.add(department)
    return [...values].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  }, [department, employees])

  function openCreateEditor() {
    setDraft({ ...EMPTY_DRAFT })
    setFormError(null)
    createMutation.reset()
    updateMutation.reset()
    setEditor({ mode: 'create' })
  }

  function openEditEditor(employee: Employee) {
    setDraft(employeeToDraft(employee))
    setFormError(null)
    createMutation.reset()
    updateMutation.reset()
    setEditor({ mode: 'edit', employee })
  }

  function submitEditor() {
    if (!draft.displayName.trim()) {
      setFormError({ field: 'displayName', message: '请填写员工姓名。' })
      return
    }
    if (
      !Number.isFinite(draft.weeklyCapacityHours) ||
      draft.weeklyCapacityHours < 0 ||
      draft.weeklyCapacityHours > 168
    ) {
      setFormError({
        field: 'weeklyCapacityHours',
        message: '每周可用工时需在 0 到 168 小时之间。',
      })
      return
    }
    setFormError(null)
    if (editor?.mode === 'edit') {
      updateMutation.mutate({
        employeeId: editor.employee.id,
        input: draftToUpdateInput(draft),
      })
    } else {
      createMutation.mutate(draftToCreateInput(draft))
    }
  }

  function updateDraft(nextDraft: EmployeeProfileDraft) {
    setDraft(nextDraft)
    if (formError) setFormError(null)
  }

  function confirmArchive(employee: Employee) {
    Modal.confirm({
      title: '归档员工？',
      content: `归档后${employee.displayName}将不再出现在员工目录，已有工作记录仍会保留。`,
      okText: '确认归档',
      cancelText: '取消',
      okButtonProps: { type: 'danger', 'aria-label': '确认归档' },
      onOk: () => archiveMutation.mutateAsync(employee.id),
    })
  }

  const columns: ColumnProps<Employee>[] = [
    {
      title: '员工',
      dataIndex: 'displayName',
      width: 210,
      render: (_value, employee) => (
        <div className="employee-name-cell">
          <span aria-hidden="true">{employee.displayName.slice(0, 1)}</span>
          <div>
            <Link
              to={ROUTES.employeeDetail(employee.id)}
              aria-label={`查看${employee.displayName}档案`}
            >
              {employee.displayName}
            </Link>
            <small>{employee.roleTitle || '岗位未设置'}</small>
          </div>
        </div>
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      width: 150,
      render: (value: string | null) => value || '未设置',
    },
    {
      title: '岗位',
      dataIndex: 'roleTitle',
      width: 180,
      render: (value: string | null) => value || '未设置',
    },
    {
      title: '直属负责人',
      dataIndex: 'managerName',
      width: 150,
      render: (value: string | null) => value || '未设置',
    },
    {
      title: '状态',
      dataIndex: 'employmentStatus',
      width: 100,
      render: (value: EmploymentStatus) => (
        <Tag color={EMPLOYMENT_STATUS_COLORS[value]}>{employmentStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '每周容量',
      dataIndex: 'weeklyCapacityHours',
      width: 110,
      render: (value: number) => `${value} 小时`,
    },
    {
      title: '技能',
      dataIndex: 'skills',
      width: 220,
      render: (_value, employee) =>
        employee.skills.length > 0 ? (
          <div className="employees-page__skills">
            {employee.skills.slice(0, 3).map((skill) => (
              <Tag key={skill.id}>{skill.name}</Tag>
            ))}
            {employee.skills.length > 3 ? <span>+{employee.skills.length - 3}</span> : null}
          </div>
        ) : (
          <span className="employees-page__muted">未录入</span>
        ),
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 190,
      fixed: 'right',
      render: (_value, employee) => (
        <div className="employees-page__row-actions">
          <Link
            to={ROUTES.employeeDetail(employee.id)}
            aria-label={`查看${employee.displayName}档案`}
          >
            查看
          </Link>
          <Button
            theme="borderless"
            aria-label={`编辑${employee.displayName}`}
            onClick={() => openEditEditor(employee)}
          >
            编辑
          </Button>
          <Button
            theme="borderless"
            type="danger"
            aria-label={`归档${employee.displayName}`}
            onClick={() => confirmArchive(employee)}
          >
            归档
          </Button>
        </div>
      ),
    },
  ]

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="employees-page">
      <header className="employees-page__header">
        <div>
          <h1>员工</h1>
          <p>统一维护员工档案、工作计划和团队进展。</p>
        </div>
        <Button
          theme="solid"
          type="primary"
          icon={<IconPlus />}
          aria-label="新建员工"
          onClick={openCreateEditor}
        >
          新建员工
        </Button>
      </header>

      <section className="employees-page__surface" aria-label="员工工作区">
        <Tabs
          activeKey={tab}
          type="line"
          keepDOM={false}
          className="employees-page__tabs"
          onChange={(nextTab) =>
            searchParams.update(
              { tab: nextTab, page: 1 },
              { defaults: { tab: 'directory', page: 1 } }
            )
          }
        >
          <TabPane tab="团队概览" itemKey="overview">
            <PlannedTabState
              title="团队进展看板将在后续阶段接入"
              description="员工档案与工作计划数据会在这里聚合为周报和月报。"
            />
          </TabPane>
          <TabPane tab="员工目录" itemKey="directory">
            <div className="employees-page__toolbar">
              <Input
                aria-label="搜索员工"
                prefix={<IconSearch />}
                value={searchDraft}
                placeholder="搜索姓名、岗位或部门"
                showClear
                onChange={setSearchDraft}
              />
              <span id="employee-department-filter-label" className="workspace-visually-hidden">
                部门
              </span>
              <Select
                aria-labelledby="employee-department-filter-label"
                value={department || undefined}
                placeholder="全部部门，可输入任意部门"
                showClear
                filter
                allowCreate
                optionList={departmentOptions.map((value) => ({ value, label: value }))}
                onChange={(value) =>
                  searchParams.update(
                    { department: value ? String(value) : undefined, page: 1 },
                    { defaults: { page: 1 } }
                  )
                }
              />
              <span id="employee-status-filter-label" className="workspace-visually-hidden">
                在职状态
              </span>
              <Select
                aria-labelledby="employee-status-filter-label"
                value={employmentStatus ?? 'ALL'}
                optionList={[{ value: 'ALL', label: '全部状态' }, ...EMPLOYMENT_STATUS_OPTIONS]}
                onChange={(value) =>
                  searchParams.update(
                    {
                      employmentStatus: value === 'ALL' ? undefined : String(value),
                      page: 1,
                    },
                    { defaults: { page: 1 } }
                  )
                }
              />
            </div>

            {employeesQuery.isPending ? (
              <p role="status" className="workspace-visually-hidden">
                正在加载员工目录
              </p>
            ) : null}

            {employeesQuery.isError ? (
              <div className="employees-page__feedback">
                <Banner
                  type="danger"
                  fullMode={false}
                  title="无法读取员工目录"
                  description="请确认本地服务已启动后重试。"
                  closeIcon={null}
                >
                  <Button onClick={() => void employeesQuery.refetch()}>重试</Button>
                </Banner>
              </div>
            ) : (
              <Table<Employee>
                className="employees-page__table"
                rowKey="id"
                size="middle"
                loading={employeesQuery.isPending}
                columns={columns}
                dataSource={employees}
                scroll={{ x: 1360 }}
                pagination={{
                  currentPage: page,
                  pageSize: PAGE_SIZE,
                  total: employeesQuery.data?.meta.total ?? 0,
                  showTotal: true,
                  showSizeChanger: false,
                  onPageChange: (nextPage) =>
                    searchParams.update({ page: nextPage }, { defaults: { page: 1 } }),
                }}
                empty={
                  <Empty
                    title="还没有符合条件的员工"
                    description="调整筛选条件，或新建第一份员工档案。"
                  />
                }
              />
            )}
          </TabPane>
          <TabPane tab="工作明细" itemKey="work-items">
            <PlannedTabState
              title="员工工作明细将在后续阶段接入"
              description="计划、总结和项目关联会在这里统一查看。"
            />
          </TabPane>
          <TabPane tab="计划导入" itemKey="imports">
            <div className="employees-page__imports">
              <div className="employees-page__imports-header">
                <div>
                  <h2>工作计划导入</h2>
                  <p>使用 Excel 模板批量导入员工计划与总结，支持预检纠错、版本替换与历史恢复。</p>
                </div>
                <Button
                  theme="solid"
                  type="primary"
                  icon={<IconPlus />}
                  aria-label="导入工作计划"
                  onClick={() => setImportWizardOpen(true)}
                >
                  导入工作计划
                </Button>
              </div>
              <EmployeeImportHistory />
            </div>
            <EmployeeImportWizard
              visible={importWizardOpen}
              onClose={() => setImportWizardOpen(false)}
            />
          </TabPane>
        </Tabs>
      </section>

      <Modal
        title={editor?.mode === 'edit' ? '编辑员工档案' : '新建员工'}
        visible={Boolean(editor)}
        width={600}
        closeOnEsc={!isSaving}
        maskClosable={!isSaving}
        onCancel={() => {
          if (!isSaving) setEditor(null)
        }}
        footer={
          <div className="workspace-modal-footer">
            <Button disabled={isSaving} onClick={() => setEditor(null)}>
              取消
            </Button>
            <Button
              htmlType="submit"
              form="employee-profile-form"
              theme="solid"
              type="primary"
              loading={isSaving}
            >
              保存员工档案
            </Button>
          </div>
        }
      >
        <p className="employees-page__modal-copy">
          档案用于工作计划、团队进展和项目协作，请保持姓名与部门准确。
        </p>
        <EmployeeProfileForm
          formId="employee-profile-form"
          value={draft}
          onChange={updateDraft}
          onSubmit={submitEditor}
          disabled={isSaving}
          error={formError}
        />
      </Modal>
    </div>
  )
}
