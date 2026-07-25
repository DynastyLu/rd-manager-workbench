import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Modal, Spin, Tag } from '@douyinfe/semi-ui'
import { IconDownload, IconUpload } from '@douyinfe/semi-icons'
import { toast } from 'sonner'
import { WorkspaceSelect } from '@/components/workspace/WorkspaceSelect'
import {
  archiveEmployeeWorkImport,
  commitEmployeeWorkImport,
  downloadEmployeeWorkImportTemplate,
  getEmployeeWorkImport,
  listEmployees,
  previewEmployeeWorkImport,
  resolveEmployeeWorkImport,
  uploadEmployeeWorkImport,
} from '../api'
import { listProjects } from '@/modules/workbench/api/projects'
import { listTasks } from '@/modules/workbench/api/tasks'
import { saveDownloadedFile } from '../download'
import { employeeQueryKeys } from '../queryKeys'
import type {
  EmployeeWorkImportBatch,
  EmployeeWorkImportRow,
  ResolveEmployeeImportRowInput,
} from '../types'

type WizardStep = 'select' | 'recognition' | 'preflight' | 'resolutions' | 'confirm' | 'result'

interface EmployeeImportWizardProps {
  visible: boolean
  onClose: () => void
}

// Backend caps rowsPageSize at MAX_EMPLOYEE_PAGE_SIZE (100); a larger value
// makes the detail request fail validation and problem rows never render.
const DETAIL_FILTERS = { rowsPageSize: 100 }
const OPTION_PAGE_SIZE = 100

const PERIOD_TYPE_LABELS = { WEEK: '周报', MONTH: '月报' } as const

const COMMITTED_STATUSES = new Set(['COMPLETED', 'SUPERSEDED', 'EXPIRED'])

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
  const [employeeName, setEmployeeName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [taskCode, setTaskCode] = useState('')
  const [templatePending, setTemplatePending] = useState(false)

  const detailQuery = useQuery({
    queryKey: batch
      ? employeeQueryKeys.importDetail(batch.id, DETAIL_FILTERS)
      : ['employees', 'import', 'idle'],
    queryFn: () => getEmployeeWorkImport(batch!.id, DETAIL_FILTERS),
    enabled: Boolean(batch) && (step === 'preflight' || step === 'resolutions'),
  })

  const resolverOpen = resolvingRow !== null
  const employeesQuery = useQuery({
    queryKey: employeeQueryKeys.list({ pageSize: OPTION_PAGE_SIZE }),
    queryFn: () => listEmployees({ pageSize: OPTION_PAGE_SIZE }),
    enabled: resolverOpen,
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'list', { pageSize: OPTION_PAGE_SIZE }],
    queryFn: () => listProjects({ pageSize: OPTION_PAGE_SIZE }),
    enabled: resolverOpen,
  })
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'list', { pageSize: OPTION_PAGE_SIZE }],
    queryFn: () => listTasks({ pageSize: OPTION_PAGE_SIZE }),
    enabled: resolverOpen,
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
      if (nextBatch.errorRows + nextBatch.unresolvedRows === 0) {
        setStep('preflight')
      }
      await queryClient.invalidateQueries({
        queryKey: employeeQueryKeys.importDetail(nextBatch.id, DETAIL_FILTERS),
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
    },
  })

  const discardMutation = useMutation({
    mutationFn: (batchId: string) => archiveEmployeeWorkImport(batchId),
  })

  function resetWizard() {
    setStep('select')
    setBatch(null)
    setResolvingRow(null)
    setEmployeeName('')
    setProjectCode('')
    setTaskCode('')
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

  function finish() {
    resetWizard()
    onClose()
  }

  function requestClose() {
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
      saveDownloadedFile(await downloadEmployeeWorkImportTemplate())
    } catch (error) {
      toast.error(errorMessage(error, '模板下载失败，请重试。'))
    } finally {
      setTemplatePending(false)
    }
  }

  const employeeOptions = useMemo(
    () =>
      (employeesQuery.data?.data ?? []).map((employee) => ({
        value: employee.displayName,
        label: employee.displayName,
      })),
    [employeesQuery.data]
  )
  const employeeIdByName = useMemo(
    () =>
      new Map((employeesQuery.data?.data ?? []).map((employee) => [employee.displayName, employee.id])),
    [employeesQuery.data]
  )
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((project) => ({
        value: project.code,
        label: `${project.code} · ${project.name}`,
      })),
    [projectsQuery.data]
  )
  const projectIdByCode = useMemo(
    () => new Map((projectsQuery.data?.data ?? []).map((project) => [project.code, project.id])),
    [projectsQuery.data]
  )
  const taskOptions = useMemo(
    () =>
      (tasksQuery.data?.data ?? []).map((task) => ({
        value: task.code,
        label: `${task.code} · ${task.title}`,
      })),
    [tasksQuery.data]
  )
  const taskIdByCode = useMemo(
    () => new Map((tasksQuery.data?.data ?? []).map((task) => [task.code, task.id])),
    [tasksQuery.data]
  )

  const problemRows = useMemo(
    () => (detailQuery.data?.rows ?? []).filter((row) => row.status !== 'VALID'),
    [detailQuery.data]
  )

  const flowError =
    uploadMutation.error ?? previewMutation.error ?? commitMutation.error ?? null

  const canCommit =
    Boolean(batch) &&
    batch!.errorRows === 0 &&
    batch!.unresolvedRows === 0 &&
    batch!.status === 'READY' &&
    !commitMutation.isPending

  function openResolver(row: EmployeeWorkImportRow) {
    setResolvingRow(row)
    setEmployeeName('')
    setProjectCode('')
    setTaskCode('')
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
    (employeeName !== '' || projectCode !== '' || taskCode !== '') &&
    (!resolverNeeds.employee || employeeName !== '') &&
    (!resolverNeeds.project || projectCode !== '') &&
    (!resolverNeeds.task || taskCode !== '')

  function saveResolution() {
    if (!resolvingRow) return
    const resolution: ResolveEmployeeImportRowInput = { rowNumber: resolvingRow.rowNumber }
    const employeeId = employeeName ? employeeIdByName.get(employeeName) : undefined
    const projectId = projectCode ? projectIdByCode.get(projectCode) : undefined
    const taskId = taskCode ? taskIdByCode.get(taskCode) : undefined
    if (employeeId) resolution.employeeId = employeeId
    if (projectId) resolution.projectId = projectId
    if (taskId) resolution.taskId = taskId
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
      <section
        className="employee-import-wizard__resolver"
        aria-label={`第 ${rowNumber} 行关联`}
      >
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
              value={employeeName}
              options={employeeOptions}
              onChange={(value) => setEmployeeName(value)}
            />
          </div>
          <div className="employee-import-wizard__resolver-field">
            <WorkspaceSelect
              aria-label={`第 ${rowNumber} 行项目`}
              placeholder="选择项目（可选）"
              filter
              showClear
              value={projectCode}
              options={projectOptions}
              onChange={(value) => setProjectCode(value)}
            />
          </div>
          <div className="employee-import-wizard__resolver-field">
            <WorkspaceSelect
              aria-label={`第 ${rowNumber} 行任务`}
              placeholder="选择任务（可选）"
              filter
              showClear
              value={taskCode}
              options={taskOptions}
              onChange={(value) => setTaskCode(value)}
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
          <Button
            icon={<IconDownload aria-hidden="true" />}
            aria-label="下载导入模板"
            loading={templatePending}
            onClick={() => void handleTemplateDownload()}
          >
            下载导入模板
          </Button>
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
          <h3>{step === 'preflight' ? '预检通过' : '处理错误与待关联行'}</h3>
          <p className="employee-import-wizard__period">{periodText(batch)}</p>
          {renderCounts(batch)}
          {step === 'resolutions' ? (
            <div className="employee-import-wizard__rows">
              {detailQuery.isPending ? (
                <p role="status">正在加载数据行…</p>
              ) : null}
              {problemRows.map((row) => (
                <div key={row.id} className="employee-import-wizard__row">
                  <div className="employee-import-wizard__row-header">
                    <Tag color={row.status === 'ERROR' ? 'red' : 'amber'}>
                      第 {row.rowNumber} 行
                    </Tag>
                    <span>{isNormalizedRow(row) ? row.normalizedValues.title : '无法解析的行'}</span>
                  </div>
                  {renderRowErrors(row)}
                  {row.status === 'UNRESOLVED' ? (
                    <Button
                      size="small"
                      onClick={() => openResolver(row)}
                    >
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
            导入将为「{periodText(batch)}」写入 {batch.validRows} 行工作计划与总结，并生成该周期的新版本。
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
      return <Button onClick={requestClose}>取消</Button>
    }
    if (step === 'recognition') {
      return (
        <Button disabled={previewMutation.isPending} onClick={requestClose}>
          取消
        </Button>
      )
    }
    if (step === 'preflight' || step === 'resolutions') {
      return (
        <>
          <Button onClick={requestClose}>取消</Button>
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
              setStep(batch && batch.errorRows + batch.unresolvedRows > 0 ? 'resolutions' : 'preflight')
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
