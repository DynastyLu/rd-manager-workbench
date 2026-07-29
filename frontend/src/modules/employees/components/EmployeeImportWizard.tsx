import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Modal, Pagination, Spin, Tag } from '@douyinfe/semi-ui'
import { IconDownload, IconUpload } from '@douyinfe/semi-icons'
import { toast } from 'sonner'
import { WorkspaceSelect } from '@/components/workspace/WorkspaceSelect'
import { WorkspaceDatePicker } from '@/components/workspace/WorkspaceDatePicker'
import { loadAllPages } from '@/lib/loadAllPages'
import {
  archiveEmployeeWorkImport,
  commitEmployeeWorkImport,
  downloadEmployeeWorkImportTemplate,
  getEmployee,
  getEmployeeWorkImport,
  listEmployees,
  previewEmployeeWorkImport,
  resolveEmployeeWorkImport,
  uploadEmployeeWorkImport,
} from '../api'
import { getProject, listProjects } from '@/modules/workbench/api/projects'
import { getTask, listTasks } from '@/modules/workbench/api/tasks'
import { saveDownloadedFile } from '../download'
import { employeeQueryKeys } from '../queryKeys'
import { EmployeeImportAssociationModal } from './EmployeeImportAssociationModal'
import type {
  EmployeeImportDetailFilters,
  EmployeeWorkImportBatch,
  EmployeeWorkImportDetail,
  EmployeeWorkImportRow,
  ResolveEmployeeImportInput,
  ResolveEmployeeImportRowInput,
} from '../types'

type WizardStep = 'select' | 'recognition' | 'preflight' | 'resolutions' | 'confirm' | 'result'

interface EmployeeImportWizardProps {
  visible: boolean
  onClose: () => void
}

// Backend caps rowsPageSize at MAX_EMPLOYEE_PAGE_SIZE (100); a larger value
// makes the detail request fail validation and problem rows never render.
const DETAIL_ROWS_PAGE_SIZE = 100
const OPTION_PAGE_SIZE = 100

const PERIOD_TYPE_LABELS = { WEEK: '周报', MONTH: '月报' } as const

const COMMITTED_STATUSES = new Set(['COMPLETED', 'SUPERSEDED', 'EXPIRED'])

function currentMondayDateOnly(now = new Date()): string {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = monday.getDay()
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1))
  const year = monday.getFullYear()
  const month = String(monday.getMonth() + 1).padStart(2, '0')
  const date = String(monday.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isNormalizedRow(
  row: EmployeeWorkImportRow
): row is EmployeeWorkImportRow & { normalizedValues: { title: string; employeeName: string } } {
  return typeof row.normalizedValues.title === 'string'
}

export function EmployeeImportWizard({ visible, onClose }: EmployeeImportWizardProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<WizardStep>('select')
  const [batch, setBatch] = useState<EmployeeWorkImportBatch | null>(null)
  const [resolvingRow, setResolvingRow] = useState<EmployeeWorkImportRow | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [rowsPage, setRowsPage] = useState(1)
  const [templatePending, setTemplatePending] = useState(false)
  const [templatePeriodStart, setTemplatePeriodStart] = useState(() => currentMondayDateOnly())
  const [associationOpen, setAssociationOpen] = useState(false)
  const [associationDismissed, setAssociationDismissed] = useState(false)

  const detailFilters = useMemo<EmployeeImportDetailFilters>(
    () => ({
      rowsPage: batch?.templateVersion === 2 ? 1 : rowsPage,
      rowsPageSize: DETAIL_ROWS_PAGE_SIZE,
      issuesOnly: batch?.templateVersion === 2 ? false : true,
    }),
    [batch?.templateVersion, rowsPage]
  )
  async function loadImportDetail(): Promise<EmployeeWorkImportDetail> {
    const firstPage = await getEmployeeWorkImport(batch!.id, detailFilters)
    if (batch!.templateVersion !== 2) return firstPage
    const pageCount = Math.ceil(firstPage.rowMeta.total / DETAIL_ROWS_PAGE_SIZE)
    if (pageCount <= 1) return firstPage
    const remainingPages = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) =>
        getEmployeeWorkImport(batch!.id, {
          rowsPage: index + 2,
          rowsPageSize: DETAIL_ROWS_PAGE_SIZE,
          issuesOnly: false,
        })
      )
    )
    return {
      ...firstPage,
      rows: [firstPage, ...remainingPages].flatMap((detail) => detail.rows),
      rowMeta: {
        ...firstPage.rowMeta,
        page: 1,
        pageSize: firstPage.rowMeta.total,
      },
    }
  }
  const detailQuery = useQuery({
    queryKey: batch
      ? employeeQueryKeys.importDetail(batch.id, detailFilters)
      : ['employees', 'import', 'idle'],
    queryFn: loadImportDetail,
    enabled: Boolean(batch) && (step === 'preflight' || step === 'resolutions'),
  })

  const resolverOpen = resolvingRow !== null
  const optionsNeeded = resolverOpen || associationOpen
  const employeesQuery = useQuery({
    queryKey: ['employees', 'list', 'all-options'],
    queryFn: () =>
      loadAllPages(
        (page, pageSize) => listEmployees({ page, pageSize }),
        OPTION_PAGE_SIZE,
      ),
    enabled: optionsNeeded,
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'list', { pageSize: 'all' }],
    queryFn: () =>
      loadAllPages(
        (page, pageSize) => listProjects({ page, pageSize }),
        OPTION_PAGE_SIZE,
      ),
    enabled: optionsNeeded,
  })
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'list', { pageSize: 'all' }],
    queryFn: () =>
      loadAllPages(
        (page, pageSize) => listTasks({ page, pageSize }),
        OPTION_PAGE_SIZE,
      ),
    enabled: optionsNeeded,
  })

  // A partially-resolved row can reference entities outside the first option
  // page; fetch those by id so the prefilled selects show real labels.
  const savedEmployeeMissing =
    resolverOpen &&
    Boolean(selectedEmployeeId) &&
    employeesQuery.isSuccess &&
    !(employeesQuery.data?.data ?? []).some((employee) => employee.id === selectedEmployeeId)
  const savedEmployeeQuery = useQuery({
    queryKey: savedEmployeeMissing
      ? employeeQueryKeys.detail(selectedEmployeeId)
      : ['employees', 'detail', 'resolver-idle'],
    queryFn: () => getEmployee(selectedEmployeeId),
    enabled: savedEmployeeMissing,
  })
  const savedProjectMissing =
    resolverOpen &&
    Boolean(selectedProjectId) &&
    projectsQuery.isSuccess &&
    !(projectsQuery.data?.data ?? []).some((project) => project.id === selectedProjectId)
  const savedProjectQuery = useQuery({
    queryKey: savedProjectMissing ? ['project', selectedProjectId] : ['project', 'resolver-idle'],
    queryFn: () => getProject(selectedProjectId),
    enabled: savedProjectMissing,
  })
  const savedTaskMissing =
    resolverOpen &&
    Boolean(selectedTaskId) &&
    tasksQuery.isSuccess &&
    !(tasksQuery.data?.data ?? []).some((task) => task.id === selectedTaskId)
  const savedTaskQuery = useQuery({
    queryKey: savedTaskMissing ? ['task', selectedTaskId] : ['task', 'resolver-idle'],
    queryFn: () => getTask(selectedTaskId),
    enabled: savedTaskMissing,
  })

  const previewMutation = useMutation({
    mutationFn: (batchId: string) => previewEmployeeWorkImport(batchId),
    onSuccess: (nextBatch) => {
      setBatch(nextBatch)
      setStep(nextBatch.errorRows + nextBatch.unresolvedRows > 0 ? 'resolutions' : 'preflight')
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadEmployeeWorkImport(file),
    onSuccess: (nextBatch) => {
      setBatch(nextBatch)
      setStep('recognition')
      previewMutation.mutate(nextBatch.id)
    },
  })

  const resolveMutation = useMutation({
    mutationFn: (input: { rows: ResolveEmployeeImportRowInput[] }) =>
      resolveEmployeeWorkImport(batch!.id, input),
    onSuccess: async (nextBatch) => {
      setBatch(nextBatch)
      setResolvingRow(null)
      setAssociationOpen(false)
      setAssociationDismissed(true)
      if (nextBatch.templateVersion === 2) {
        setStep('preflight')
      } else if (nextBatch.errorRows + nextBatch.unresolvedRows === 0) {
        setStep('preflight')
      }
      await queryClient.invalidateQueries({
        queryKey: ['employees', 'import', nextBatch.id],
      })
    },
    onError: (error) => {
      toast.error(errorMessage(error, '保存关联失败，请重试。'))
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => commitEmployeeWorkImport(batch!.id),
    onSuccess: async (nextBatch) => {
      setBatch(nextBatch)
      setStep('result')
      await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.all })
      // Commits create/archive resource load entries surfaced outside the employees module.
      await queryClient.invalidateQueries({ queryKey: ['resource-load-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })

  const discardMutation = useMutation({
    mutationFn: (batchId: string) => archiveEmployeeWorkImport(batchId),
  })

  function resetWizard() {
    setStep('select')
    setBatch(null)
    setResolvingRow(null)
    setSelectedEmployeeId('')
    setSelectedProjectId('')
    setSelectedTaskId('')
    setRowsPage(1)
    setAssociationOpen(false)
    setAssociationDismissed(false)
    uploadMutation.reset()
    previewMutation.reset()
    resolveMutation.reset()
    commitMutation.reset()
    discardMutation.reset()
  }

  useEffect(() => {
    if (visible) resetWizard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    if (
      batch?.templateVersion === 2 &&
      step === 'resolutions' &&
      detailQuery.isSuccess &&
      detailQuery.data.rows.length > 0 &&
      !associationDismissed
    ) {
      setAssociationOpen(true)
    }
  }, [
    associationDismissed,
    batch?.templateVersion,
    detailQuery.data?.rows.length,
    detailQuery.isSuccess,
    step,
  ])

  function finish() {
    resetWizard()
    onClose()
  }

  function requestClose() {
    // Closing mid-upload would strand the batch created on the server.
    if (uploadMutation.isPending) return
    if (!batch || COMMITTED_STATUSES.has(batch.status) || step === 'result') {
      finish()
      return
    }
    Modal.confirm({
      title: '放弃本次导入？',
      content: '当前导入还未提交，关闭将删除该导入会话，已上传的文件不会被保留。',
      okText: '删除并关闭',
      cancelText: '继续导入',
      okButtonProps: { type: 'danger', 'aria-label': '删除并关闭' },
      onOk: async () => {
        try {
          await discardMutation.mutateAsync(batch.id)
          finish()
        } catch (error) {
          toast.error(errorMessage(error, '删除导入会话失败，请重试。'))
        }
      },
    })
  }

  function handleFile(file: File | undefined) {
    if (!file) return
    uploadMutation.mutate(file)
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    handleFile(file)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    if (uploadMutation.isPending) return
    handleFile(event.dataTransfer.files?.[0])
  }

  async function handleTemplateDownload() {
    setTemplatePending(true)
    try {
      saveDownloadedFile(await downloadEmployeeWorkImportTemplate(templatePeriodStart))
    } catch (error) {
      toast.error(errorMessage(error, '模板下载失败，请重试。'))
    } finally {
      setTemplatePending(false)
    }
  }

  const employeeOptions = useMemo(() => {
    const options = (employeesQuery.data?.data ?? []).map((employee) => ({
      value: employee.id,
      label: employee.displayName,
    }))
    if (selectedEmployeeId && !options.some((option) => option.value === selectedEmployeeId)) {
      options.push({
        value: selectedEmployeeId,
        label: savedEmployeeQuery.data?.displayName ?? '已选员工',
      })
    }
    return options
  }, [employeesQuery.data, selectedEmployeeId, savedEmployeeQuery.data])
  const projectOptions = useMemo(() => {
    const options = (projectsQuery.data?.data ?? []).map((project) => ({
      value: project.id,
      label: `${project.code} · ${project.name}`,
    }))
    if (selectedProjectId && !options.some((option) => option.value === selectedProjectId)) {
      const saved = savedProjectQuery.data
      options.push({
        value: selectedProjectId,
        label: saved ? `${saved.code} · ${saved.name}` : '已选项目',
      })
    }
    return options
  }, [projectsQuery.data, selectedProjectId, savedProjectQuery.data])
  const taskOptions = useMemo(() => {
    const options = (tasksQuery.data?.data ?? []).map((task) => ({
      value: task.id,
      label: `${task.code} · ${task.title}`,
    }))
    if (selectedTaskId && !options.some((option) => option.value === selectedTaskId)) {
      const saved = savedTaskQuery.data
      options.push({
        value: selectedTaskId,
        label: saved ? `${saved.code} · ${saved.title}` : '已选任务',
      })
    }
    return options
  }, [tasksQuery.data, selectedTaskId, savedTaskQuery.data])

  const problemRows = useMemo(
    () => (detailQuery.data?.rows ?? []).filter((row) => row.status !== 'VALID'),
    [detailQuery.data]
  )
  const v2Rows = batch?.templateVersion === 2 ? (detailQuery.data?.rows ?? []) : []
  const currentWorkRows = v2Rows.filter(
    (row) =>
      row.sourceSection === 'CURRENT_WORK' ||
      (!row.sourceSection && row.normalizedValues.sourceSection !== 'NEXT_WEEK_PLAN')
  ).length
  const nextWeekPlanRows = v2Rows.filter(
    (row) =>
      row.sourceSection === 'NEXT_WEEK_PLAN' ||
      row.normalizedValues.sourceSection === 'NEXT_WEEK_PLAN'
  ).length

  const flowError = uploadMutation.error ?? previewMutation.error ?? commitMutation.error ?? null

  const canCommit =
    Boolean(batch) &&
    batch!.errorRows === 0 &&
    batch!.unresolvedRows === 0 &&
    batch!.status === 'READY' &&
    !commitMutation.isPending

  function openResolver(row: EmployeeWorkImportRow) {
    setResolvingRow(row)
    setSelectedEmployeeId(row.resolvedEmployeeId ?? '')
    setSelectedProjectId(row.resolvedProjectId ?? '')
    setSelectedTaskId(row.resolvedTaskId ?? '')
  }

  const resolverNeeds = useMemo(() => {
    const codes = new Set((resolvingRow?.errors ?? []).map((error) => error.code))
    return {
      employee: codes.has('EMPLOYEE_NOT_FOUND'),
      project: codes.has('PROJECT_NOT_FOUND'),
      task: codes.has('TASK_NOT_FOUND') || codes.has('TASK_PROJECT_MISMATCH'),
    }
  }, [resolvingRow])

  const canSaveResolution =
    resolvingRow !== null &&
    (selectedEmployeeId !== '' || selectedProjectId !== '' || selectedTaskId !== '') &&
    (!resolverNeeds.employee || selectedEmployeeId !== '') &&
    (!resolverNeeds.project || selectedProjectId !== '') &&
    (!resolverNeeds.task || selectedTaskId !== '')

  function saveResolution() {
    if (!resolvingRow) return
    const resolution: ResolveEmployeeImportRowInput = { rowNumber: resolvingRow.rowNumber }
    if (selectedEmployeeId) resolution.employeeId = selectedEmployeeId
    if (selectedProjectId) resolution.projectId = selectedProjectId
    if (selectedTaskId) resolution.taskId = selectedTaskId
    resolveMutation.mutate({ rows: [resolution] })
  }

  function periodText(current: EmployeeWorkImportBatch) {
    return `${PERIOD_TYPE_LABELS[current.periodType]} ${current.periodStart} ~ ${current.periodEnd}`
  }

  function renderCounts(current: EmployeeWorkImportBatch) {
    return (
      <div className="employee-import-wizard__counts" aria-label="预检结果">
        <span>共 {current.totalRows} 行</span>
        <span>有效 {current.validRows} 行</span>
        <span>错误 {current.errorRows + current.unresolvedRows} 行</span>
        {current.unresolvedRows > 0 ? <span>其中 {current.unresolvedRows} 行待关联</span> : null}
      </div>
    )
  }

  function renderRowErrors(row: EmployeeWorkImportRow) {
    return (
      <ul className="employee-import-wizard__row-errors">
        {row.errors.map((error, index) => (
          <li key={`${error.field}-${error.code}-${index}`}>
            {error.field}：{error.reason ?? error.code}
            {error.rawValue !== undefined && error.rawValue !== null
              ? `（当前值：${String(error.rawValue)}）`
              : ''}
          </li>
        ))}
      </ul>
    )
  }

  function renderResolver() {
    if (!resolvingRow) return null
    const rowNumber = resolvingRow.rowNumber
    return (
      <section className="employee-import-wizard__resolver" aria-label={`第 ${rowNumber} 行关联`}>
        <h4>第 {rowNumber} 行：人工关联</h4>
        {employeesQuery.isPending || projectsQuery.isPending || tasksQuery.isPending ? (
          <p role="status">正在加载可选项…</p>
        ) : null}
        <div className="employee-import-wizard__resolver-fields">
          <div className="employee-import-wizard__resolver-field">
            <WorkspaceSelect
              aria-label={`第 ${rowNumber} 行员工`}
              placeholder="选择员工"
              filter
              showClear
              value={selectedEmployeeId}
              options={employeeOptions}
              onChange={(value) => setSelectedEmployeeId(value)}
            />
          </div>
          <div className="employee-import-wizard__resolver-field">
            <WorkspaceSelect
              aria-label={`第 ${rowNumber} 行项目`}
              placeholder="选择项目（可选）"
              filter
              showClear
              value={selectedProjectId}
              options={projectOptions}
              onChange={(value) => setSelectedProjectId(value)}
            />
          </div>
          <div className="employee-import-wizard__resolver-field">
            <WorkspaceSelect
              aria-label={`第 ${rowNumber} 行任务`}
              placeholder="选择任务（可选）"
              filter
              showClear
              value={selectedTaskId}
              options={taskOptions}
              onChange={(value) => setSelectedTaskId(value)}
            />
          </div>
        </div>
        <div className="employee-import-wizard__resolver-actions">
          <Button disabled={resolveMutation.isPending} onClick={() => setResolvingRow(null)}>
            取消
          </Button>
          <Button
            theme="solid"
            type="primary"
            disabled={!canSaveResolution}
            loading={resolveMutation.isPending}
            onClick={saveResolution}
          >
            保存关联
          </Button>
        </div>
      </section>
    )
  }

  function renderBody() {
    if (step === 'select') {
      return (
        <div className="employee-import-wizard__select">
          <label
            className="employee-import-wizard__dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".xlsx"
              aria-label="选择员工计划与总结 Excel"
              className="employee-import-wizard__file-input"
              disabled={uploadMutation.isPending}
              onChange={handleFileInput}
            />
            <IconUpload aria-hidden="true" />
            <strong>选择或拖入员工计划与总结 Excel</strong>
            <span>仅支持 .xlsx 模板文件，上传后自动识别模板与周期并预检。</span>
            {uploadMutation.isPending ? <Spin size="small" /> : null}
          </label>
          <div className="employee-import-wizard__template-download">
            <div role="group" aria-label="模板周期选择区域">
              <span>模板周一日期</span>
              <WorkspaceDatePicker
                aria-label="模板周一日期"
                mode="date"
                value={templatePeriodStart}
                required
                onChange={(value) => {
                  const selected = new Date(`${value}T00:00:00`)
                  if (!Number.isNaN(selected.getTime())) {
                    setTemplatePeriodStart(currentMondayDateOnly(selected))
                  }
                }}
              />
            </div>
            <span>请选择要填写周报的周期，选择其他日期会自动归到当周周一。</span>
            <Button
              icon={<IconDownload aria-hidden="true" />}
              aria-label="下载导入模板"
              loading={templatePending}
              disabled={!templatePeriodStart}
              onClick={() => void handleTemplateDownload()}
            >
              下载导入模板
            </Button>
          </div>
        </div>
      )
    }

    if (step === 'recognition' && batch) {
      return (
        <div className="employee-import-wizard__recognition">
          <h3>已识别模板与周期</h3>
          <dl>
            <div>
              <dt>文件</dt>
              <dd>{batch.originalName}</dd>
            </div>
            <div>
              <dt>模板版本</dt>
              <dd>v{batch.templateVersion}</dd>
            </div>
            <div>
              <dt>周期</dt>
              <dd>{periodText(batch)}</dd>
            </div>
          </dl>
          {previewMutation.isPending ? (
            <p role="status" className="employee-import-wizard__pending">
              <Spin size="small" /> 正在预检全部数据行…
            </p>
          ) : null}
          {previewMutation.isError ? (
            <Button type="primary" onClick={() => previewMutation.mutate(batch.id)}>
              重试预检
            </Button>
          ) : null}
        </div>
      )
    }

    if ((step === 'preflight' || step === 'resolutions') && batch) {
      return (
        <div className="employee-import-wizard__preflight">
          <h3>
            {step === 'preflight'
              ? '预检完成'
              : batch.templateVersion === 2
                ? '预检完成，等待字段补全'
                : '处理错误与待关联行'}
          </h3>
          <p className="employee-import-wizard__period">{periodText(batch)}</p>
          {renderCounts(batch)}
          {batch.templateVersion === 2 ? (
            <div className="employee-import-wizard__v2-summary" aria-label="V2 导入汇总">
              <span>本周工作 {currentWorkRows} 行</span>
              <span>下周计划 {nextWeekPlanRows} 行</span>
              {step === 'resolutions' ? (
                <Button
                  theme="solid"
                  type="primary"
                  disabled={detailQuery.isPending}
                  onClick={() => {
                    setAssociationDismissed(false)
                    setAssociationOpen(true)
                  }}
                >
                  打开字段补全
                </Button>
              ) : null}
            </div>
          ) : step === 'resolutions' ? (
            <div className="employee-import-wizard__rows">
              {detailQuery.isPending ? <p role="status">正在加载数据行…</p> : null}
              {problemRows.map((row) => (
                <div key={row.id} className="employee-import-wizard__row">
                  <div className="employee-import-wizard__row-header">
                    <Tag color={row.status === 'ERROR' ? 'red' : 'amber'}>
                      第 {row.rowNumber} 行
                    </Tag>
                    <span>
                      {isNormalizedRow(row) ? row.normalizedValues.title : '无法解析的行'}
                    </span>
                  </div>
                  {renderRowErrors(row)}
                  {row.status === 'UNRESOLVED' ? (
                    <Button size="small" onClick={() => openResolver(row)}>
                      {row.errors.some((error) => error.code === 'EMPLOYEE_NOT_FOUND')
                        ? `为第 ${row.rowNumber} 行选择员工`
                        : `为第 ${row.rowNumber} 行完善关联`}
                    </Button>
                  ) : (
                    <p className="employee-import-wizard__row-hint">
                      该行存在数据错误，请修正源文件后重新上传。
                    </p>
                  )}
                </div>
              ))}
              {detailQuery.data && detailQuery.data.rowMeta.total > DETAIL_ROWS_PAGE_SIZE ? (
                <Pagination
                  className="employee-import-wizard__pagination"
                  currentPage={rowsPage}
                  pageSize={DETAIL_ROWS_PAGE_SIZE}
                  total={detailQuery.data.rowMeta.total}
                  showSizeChanger={false}
                  onPageChange={(nextPage) => setRowsPage(nextPage)}
                />
              ) : null}
              {renderResolver()}
            </div>
          ) : null}
        </div>
      )
    }

    if (step === 'confirm' && batch) {
      return (
        <div className="employee-import-wizard__confirm">
          <h3>确认导入并生成新版本？</h3>
          <p>
            导入将为「{periodText(batch)}」写入 {batch.validRows}{' '}
            行工作计划与总结，并生成该周期的新版本。
            如该周期已有导入版本，旧版本会被替换并标记为「已被替换」，可随时在导入历史中恢复。
          </p>
          {renderCounts(batch)}
        </div>
      )
    }

    if (step === 'result' && batch) {
      return (
        <div className="employee-import-wizard__result">
          <h3>导入完成</h3>
          <p>
            成功导入 {batch.importedRows} 行
            {batch.version !== null ? `，版本 v${batch.version}` : ''}。
          </p>
          <p className="employee-import-wizard__period">
            团队进展快照正在后台生成，可在导入历史中查看进度或重建。
          </p>
        </div>
      )
    }

    return null
  }

  function renderFooter() {
    if (step === 'select') {
      return (
        <Button disabled={uploadMutation.isPending} onClick={requestClose}>
          取消
        </Button>
      )
    }
    if (step === 'recognition') {
      return (
        <Button
          disabled={uploadMutation.isPending || previewMutation.isPending}
          onClick={requestClose}
        >
          取消
        </Button>
      )
    }
    if (step === 'preflight' || step === 'resolutions') {
      return (
        <>
          <Button disabled={uploadMutation.isPending} onClick={requestClose}>
            取消
          </Button>
          <Button
            theme="solid"
            type="primary"
            disabled={!canCommit}
            onClick={() => setStep('confirm')}
          >
            确认导入
          </Button>
        </>
      )
    }
    if (step === 'confirm') {
      return (
        <>
          <Button
            disabled={commitMutation.isPending}
            onClick={() =>
              setStep(
                batch && batch.errorRows + batch.unresolvedRows > 0 ? 'resolutions' : 'preflight'
              )
            }
          >
            返回检查
          </Button>
          <Button
            theme="solid"
            type="primary"
            loading={commitMutation.isPending}
            onClick={() => commitMutation.mutate()}
          >
            确认替换并导入
          </Button>
        </>
      )
    }
    return (
      <Button theme="solid" type="primary" onClick={finish}>
        完成
      </Button>
    )
  }

  if (visible && associationOpen) {
    return (
      <EmployeeImportAssociationModal
        visible
        rows={v2Rows}
        employees={(employeesQuery.data?.data ?? []).map((employee) => ({
          id: employee.id,
          displayName: employee.displayName,
        }))}
        projects={(projectsQuery.data?.data ?? []).map((project) => ({
          id: project.id,
          code: project.code,
          name: project.name,
        }))}
        tasks={(tasksQuery.data?.data ?? []).map((task) => ({
          id: task.id,
          projectId: task.projectId,
          code: task.code,
          title: task.title,
        }))}
        loading={
          detailQuery.isPending ||
          employeesQuery.isPending ||
          projectsQuery.isPending ||
          tasksQuery.isPending
        }
        saving={resolveMutation.isPending}
        onCancel={() => {
          setAssociationDismissed(true)
          setAssociationOpen(false)
        }}
        onSubmit={(input: ResolveEmployeeImportInput) => resolveMutation.mutate(input)}
      />
    )
  }

  return (
    <Modal
      title="导入员工计划与总结"
      visible={visible}
      width={720}
      footer={null}
      closeOnEsc={!uploadMutation.isPending && !commitMutation.isPending}
      maskClosable={false}
      onCancel={requestClose}
    >
      <div className="employee-import-wizard">
        {flowError ? (
          <Banner
            type="danger"
            fullMode={false}
            closeIcon={null}
            title={errorMessage(flowError, '操作失败，请重试。')}
          />
        ) : null}
        {renderBody()}
        <div className="workspace-modal-footer employee-import-wizard__footer">
          {renderFooter()}
        </div>
      </div>
    </Modal>
  )
}
