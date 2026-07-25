import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Empty, Modal, Table, Tag } from '@douyinfe/semi-ui'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { toast } from 'sonner'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceSearchParams'
import {
  archiveEmployeeWorkImport,
  downloadEmployeeImportErrors,
  downloadEmployeeImportSource,
  listEmployeeWorkImports,
  rebuildEmployeeWorkImportSnapshots,
  restoreEmployeeWorkImport,
} from '../api'
import { saveDownloadedFile } from '../download'
import { employeeQueryKeys } from '../queryKeys'
import type {
  EmployeeSnapshotStatus,
  EmployeeWorkImportBatch,
  EmployeeWorkImportStatus,
} from '../types'

const PAGE_SIZE = 10

const IMPORT_STATUS_LABELS: Record<EmployeeWorkImportStatus, string> = {
  UPLOADED: '已上传',
  PREVIEWED: '预检有误',
  RESOLVING: '待关联',
  READY: '待导入',
  IMPORTING: '导入中',
  COMPLETED: '已完成',
  FAILED: '导入失败',
  SUPERSEDED: '已被替换',
  EXPIRED: '已过期',
}

const IMPORT_STATUS_COLORS: Record<EmployeeWorkImportStatus, 'green' | 'amber' | 'red' | 'grey' | 'blue'> = {
  UPLOADED: 'blue',
  PREVIEWED: 'amber',
  RESOLVING: 'amber',
  READY: 'blue',
  IMPORTING: 'blue',
  COMPLETED: 'green',
  FAILED: 'red',
  SUPERSEDED: 'grey',
  EXPIRED: 'grey',
}

const SNAPSHOT_STATUS_LABELS: Record<EmployeeSnapshotStatus, string> = {
  NOT_STARTED: '未开始',
  GENERATING: '生成中',
  READY: '已生成',
  FAILED: '生成失败',
}

const SNAPSHOT_STATUS_COLORS: Record<EmployeeSnapshotStatus, 'green' | 'amber' | 'red' | 'grey'> = {
  NOT_STARTED: 'grey',
  GENERATING: 'amber',
  READY: 'green',
  FAILED: 'red',
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`
}

function showVersion(batch: EmployeeWorkImportBatch) {
  return (
    batch.version !== null &&
    (batch.status === 'COMPLETED' ||
      batch.status === 'SUPERSEDED' ||
      batch.restoredFromBatchId !== null)
  )
}

export function EmployeeImportHistory() {
  const queryClient = useQueryClient()
  const searchParams = useWorkspaceSearchParams()
  const page = searchParams.getPositiveInt('page', 1)
  const filters = { page, pageSize: PAGE_SIZE }

  const historyQuery = useQuery({
    queryKey: employeeQueryKeys.imports(filters),
    queryFn: () => listEmployeeWorkImports(filters),
  })

  async function invalidateImports() {
    await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.all })
  }

  const rebuildMutation = useMutation({
    mutationFn: (batchId: string) => rebuildEmployeeWorkImportSnapshots(batchId),
    onSuccess: async () => {
      await invalidateImports()
      toast.success('已重新开始生成快照')
    },
    onError: (error) => toast.error(errorMessage(error, '重建快照失败，请重试。')),
  })

  const restoreMutation = useMutation({
    mutationFn: (batchId: string) => restoreEmployeeWorkImport(batchId),
    onSuccess: async () => {
      await invalidateImports()
      // Restores commit a new version, which rewrites resource load entries.
      await queryClient.invalidateQueries({ queryKey: ['resource-load-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['reports'] })
      toast.success('已恢复为新版本')
    },
    onError: (error) => toast.error(errorMessage(error, '恢复版本失败，请重试。')),
  })

  const archiveMutation = useMutation({
    mutationFn: (batchId: string) => archiveEmployeeWorkImport(batchId),
    onSuccess: async () => {
      await invalidateImports()
      toast.success('过期导入已归档')
    },
    onError: (error) => toast.error(errorMessage(error, '归档失败，请重试。')),
  })

  async function handleDownload(
    batchId: string,
    fetchFile: (id: string) => Promise<{ blob: Blob; fileName: string }>,
    fallback: string
  ) {
    try {
      saveDownloadedFile(await fetchFile(batchId))
    } catch (error) {
      toast.error(errorMessage(error, fallback))
    }
  }

  function confirmRestore(batch: EmployeeWorkImportBatch) {
    Modal.confirm({
      title: '恢复该版本？',
      content: `恢复会基于「${batch.originalName}」创建一个全新的导入版本并设为当前版本，当前版本会被标记为「已被替换」，历史记录不会被删除。`,
      okText: '确认恢复',
      cancelText: '取消',
      okButtonProps: { type: 'primary', 'aria-label': '确认恢复' },
      onOk: () => restoreMutation.mutate(batch.id),
    })
  }

  const columns: ColumnProps<EmployeeWorkImportBatch>[] = [
    {
      title: '文件',
      dataIndex: 'originalName',
      width: 220,
      render: (value: string, batch) => (
        <div className="employee-import-history__file">
          <span>{value}</span>
          <small>模板 v{batch.templateVersion}</small>
        </div>
      ),
    },
    {
      title: '周期',
      dataIndex: 'periodStart',
      width: 190,
      render: (_value, batch) =>
        `${batch.periodType === 'WEEK' ? '周报' : '月报'} ${batch.periodStart} ~ ${batch.periodEnd}`,
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 130,
      render: (_value, batch) => (
        <div className="employee-import-history__version">
          <span>{showVersion(batch) ? `v${batch.version}` : '未生成'}</span>
          {batch.supersedesBatchId ? <small>替换旧版本</small> : null}
          {batch.restoredFromBatchId ? <small>由历史版本恢复</small> : null}
        </div>
      ),
    },
    {
      title: '导入状态',
      dataIndex: 'status',
      width: 100,
      render: (value: EmployeeWorkImportStatus) => (
        <Tag color={IMPORT_STATUS_COLORS[value]}>{IMPORT_STATUS_LABELS[value]}</Tag>
      ),
    },
    {
      title: '快照状态',
      dataIndex: 'snapshotStatus',
      width: 100,
      render: (value: EmployeeSnapshotStatus, batch) => (
        <Tag
          color={SNAPSHOT_STATUS_COLORS[value]}
          aria-label={
            batch.snapshotStatus === 'FAILED' && batch.snapshotError
              ? `快照生成失败：${batch.snapshotError}`
              : undefined
          }
        >
          {SNAPSHOT_STATUS_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: '行数',
      dataIndex: 'totalRows',
      width: 130,
      render: (_value, batch) => (
        <div className="employee-import-history__counts">
          <span>共 {batch.totalRows} 行</span>
          <small>导入 {batch.importedRows} 行</small>
        </div>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 150,
      render: (_value, batch) => (
        <div className="employee-import-history__timestamps">
          <span>{formatDateTime(batch.createdAt)}</span>
          <small>{batch.committedAt ? `提交 ${formatDateTime(batch.committedAt)}` : '未提交'}</small>
        </div>
      ),
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 300,
      fixed: 'right',
      render: (_value, batch) => (
        <div className="employees-page__row-actions">
          {batch.status !== 'EXPIRED' ? (
            <Button
              theme="borderless"
              onClick={() =>
                void handleDownload(
                  batch.id,
                  downloadEmployeeImportSource,
                  '源文件下载失败，请重试。'
                )
              }
            >
              下载源文件
            </Button>
          ) : null}
          {batch.hasErrors ? (
            <Button
              theme="borderless"
              onClick={() =>
                void handleDownload(
                  batch.id,
                  downloadEmployeeImportErrors,
                  '错误行下载失败，请重试。'
                )
              }
            >
              下载错误行
            </Button>
          ) : null}
          {batch.status === 'COMPLETED' && batch.snapshotStatus === 'FAILED' ? (
            <Button
              theme="borderless"
              loading={rebuildMutation.isPending}
              onClick={() => rebuildMutation.mutate(batch.id)}
            >
              重建快照
            </Button>
          ) : null}
          {batch.status === 'COMPLETED' || batch.status === 'SUPERSEDED' ? (
            <Button theme="borderless" onClick={() => confirmRestore(batch)}>
              恢复此版本
            </Button>
          ) : null}
          {batch.status === 'EXPIRED' && !batch.archivedAt ? (
            <Button
              theme="borderless"
              type="danger"
              loading={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate(batch.id)}
            >
              归档
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  if (historyQuery.isError) {
    return (
      <div className="employees-page__feedback">
        <Banner
          type="danger"
          fullMode={false}
          title="无法读取导入历史"
          description="请确认本地服务已启动后重试。"
          closeIcon={null}
        >
          <Button onClick={() => void historyQuery.refetch()}>重试</Button>
        </Banner>
      </div>
    )
  }

  return (
    <Table<EmployeeWorkImportBatch>
      className="employees-page__table"
      rowKey="id"
      size="middle"
      loading={historyQuery.isPending}
      columns={columns}
      dataSource={historyQuery.data?.data ?? []}
      scroll={{ x: 1360 }}
      pagination={{
        currentPage: page,
        pageSize: PAGE_SIZE,
        total: historyQuery.data?.meta.total ?? 0,
        showTotal: true,
        showSizeChanger: false,
        onPageChange: (nextPage) =>
          searchParams.update({ page: nextPage }, { defaults: { page: 1 } }),
      }}
      empty={<Empty title="还没有导入记录" description="点击右上角「导入工作计划」开始第一次导入。" />}
    />
  )
}
