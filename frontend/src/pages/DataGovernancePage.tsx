import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Switch, TabPane, Tabs, Tag } from '@douyinfe/semi-ui'
import { toast } from 'sonner'

import { AuditLogTable } from '@/modules/workbench/components/governance/AuditLogTable'
import { BackupPanel } from '@/modules/workbench/components/governance/BackupPanel'
import { DataHealthPanel } from '@/modules/workbench/components/governance/DataHealthPanel'
import { RestorePreflightDialog } from '@/modules/workbench/components/governance/RestorePreflightDialog'
import {
  createBackup,
  createRestorePreflight,
  deleteBackup,
  getDataHealth,
  getGovernanceSettings,
  listAuditLogs,
  listBackups,
  updateGovernanceSettings,
  verifyBackup,
  type AuditLog,
  type RestorePreflight,
} from '@/modules/workbench/api/governance'

import './DataGovernancePage.less'

export default function DataGovernancePage() {
  const client = useQueryClient()
  const [preflight, setPreflight] = useState<RestorePreflight | null>(null)
  const [auditFilter, setAuditFilter] = useState<{
    entityType?: string
    outcome?: AuditLog['outcome']
  }>({})
  const settings = useQuery({ queryKey: ['governance', 'settings'], queryFn: getGovernanceSettings })
  const backups = useQuery({ queryKey: ['governance', 'backups'], queryFn: () => listBackups() })
  const health = useQuery({ queryKey: ['governance', 'health'], queryFn: () => getDataHealth(false) })
  const audit = useQuery({
    queryKey: ['governance', 'audit', auditFilter],
    queryFn: () => listAuditLogs({ ...auditFilter, page: 1, pageSize: 20 }),
  })

  const refreshBackups = () => client.invalidateQueries({ queryKey: ['governance', 'backups'] })
  const backupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async () => {
      toast.success('本地备份已创建')
      await refreshBackups()
    },
    onError: () => toast.error('备份创建失败，请查看数据健康检查。'),
  })
  const verifyMutation = useMutation({
    mutationFn: verifyBackup,
    onSuccess: async () => {
      toast.success('备份清单验证通过')
      await refreshBackups()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteBackup,
    onSuccess: refreshBackups,
  })
  const preflightMutation = useMutation({
    mutationFn: createRestorePreflight,
    onSuccess: setPreflight,
    onError: () => toast.error('恢复预检未通过，当前数据没有发生变化。'),
  })
  const settingsMutation = useMutation({
    mutationFn: updateGovernanceSettings,
    onSuccess: (value) => client.setQueryData(['governance', 'settings'], value),
  })
  const [restoring, setRestoring] = useState(false)

  const restore = async (value: RestorePreflight) => {
    const desktop = window.rdWorkbenchDesktop
    if (!desktop?.restoreBackup) return
    setRestoring(true)
    try {
      await desktop.restoreBackup({
        backupId: value.backupId,
        preflightId: value.id,
        confirmationToken: value.confirmationToken,
        expectedHash: value.manifestSha256,
      })
      setPreflight(null)
      toast.success('恢复完成，工作台正在重新加载。')
    } catch {
      toast.error('恢复失败；系统已尝试回滚并重新启动本地服务。')
    } finally {
      setRestoring(false)
    }
  }

  const currentSettings = settings.data
  const currentBackups = backups.data?.data ?? []
  const latestVerified = currentBackups.find((item) => item.status === 'VERIFIED')
  const failedChecks = health.data?.checks.filter((item) => item.status === 'FAIL').length ?? 0

  return (
    <div className="data-governance-page">
      <header className="data-governance-page__hero">
        <div>
          <p className="data-governance-page__eyebrow">LOCAL DATA CONTROL</p>
          <h1>数据安全</h1>
          <p>备份、恢复、审计和健康检查都在本机完成，危险操作必须先通过只读预检。</p>
        </div>
        <Tag color={failedChecks > 0 ? 'red' : 'green'}>
          {failedChecks > 0 ? `${failedChecks} 项异常` : '本地数据健康'}
        </Tag>
      </header>

      <Tabs type="line" className="data-governance-page__tabs">
        <TabPane tab="概览" itemKey="overview">
          <div className="governance-overview">
            <section className="governance-overview__summary">
              <div className="governance-metric governance-metric--primary">
                <span>备份状态</span>
                <strong>{latestVerified ? '最近备份已验证' : '尚无验证备份'}</strong>
                <small>{latestVerified ? new Date(latestVerified.createdAt).toLocaleString('zh-CN') : '建议先创建手动备份'}</small>
              </div>
              <div className="governance-metric">
                <span>自动备份</span>
                <strong>{currentSettings?.autoBackupEnabled ? '已开启' : '未开启'}</strong>
                <small>{currentSettings ? `每天 ${currentSettings.autoBackupTimeLocal}` : '正在读取设置'}</small>
              </div>
              <div className="governance-metric">
                <span>健康检查</span>
                <strong>{failedChecks ? '需要处理' : '全部通过'}</strong>
                <small>{health.data?.checks.length ?? 0} 个检查项</small>
              </div>
            </section>

            <section className="governance-panel governance-settings-card">
              <div>
                <p className="governance-panel__kicker">AUTOMATIC PROTECTION</p>
                <h2>每日自动备份</h2>
                <p>保留 {currentSettings?.retentionDays ?? 30} 天；恢复前保护快照不会被自动清理。</p>
              </div>
              <Switch
                aria-label="每日自动备份"
                checked={currentSettings?.autoBackupEnabled ?? false}
                loading={settingsMutation.isPending}
                onChange={(checked) => settingsMutation.mutate({ autoBackupEnabled: checked })}
              />
            </section>
            {!window.rdWorkbenchDesktop ? (
              <Banner
                type="info"
                fullMode={false}
                closeIcon={null}
                title="当前是浏览器调试模式"
                description="可以创建、验证和预检备份；正式恢复由 Electron 主进程在本地服务停止后执行。"
              />
            ) : null}
            <DataHealthPanel
              report={health.data}
              loading={health.isFetching}
              onRefresh={() => { void health.refetch() }}
              onDeepScan={() => { void client.fetchQuery({ queryKey: ['governance', 'health', 'deep'], queryFn: () => getDataHealth(true) }) }}
            />
          </div>
        </TabPane>
        <TabPane tab="备份恢复" itemKey="backups">
          <BackupPanel
            backups={currentBackups}
            loading={backups.isLoading}
            busy={backupMutation.isPending}
            onCreate={() => { backupMutation.mutate() }}
            onVerify={(id) => { verifyMutation.mutate(id) }}
            onPreflight={(id) => { preflightMutation.mutate(id) }}
            onDelete={(id) => { deleteMutation.mutate(id) }}
          />
        </TabPane>
        <TabPane tab="审计日志" itemKey="audit">
          <AuditLogTable logs={audit.data?.data ?? []} loading={audit.isFetching} onFilter={setAuditFilter} />
        </TabPane>
        <TabPane tab="健康检查" itemKey="health">
          <DataHealthPanel
            report={health.data}
            loading={health.isFetching}
            onRefresh={() => { void health.refetch() }}
            onDeepScan={() => { void client.fetchQuery({ queryKey: ['governance', 'health', 'deep'], queryFn: () => getDataHealth(true) }) }}
          />
        </TabPane>
      </Tabs>

      <RestorePreflightDialog preflight={preflight} restoring={restoring} onClose={() => setPreflight(null)} onRestore={(value) => { void restore(value) }} />
    </div>
  )
}
