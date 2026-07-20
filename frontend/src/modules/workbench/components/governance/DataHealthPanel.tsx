import { Button, Empty, Tag } from '@douyinfe/semi-ui'

import type { DataHealthReport, HealthCheckStatus } from '@/modules/workbench/api/governance'

const CHECK_META: Record<HealthCheckStatus, { label: string; color: 'green' | 'amber' | 'red' }> = {
  PASS: { label: '通过', color: 'green' },
  WARN: { label: '关注', color: 'amber' },
  FAIL: { label: '异常', color: 'red' },
}

export function DataHealthPanel({
  report,
  loading,
  onRefresh,
  onDeepScan,
}: {
  report?: DataHealthReport
  loading: boolean
  onRefresh: () => void
  onDeepScan: () => void
}) {
  return (
    <section className="governance-panel" aria-label="数据健康检查">
      <header className="governance-panel__header">
        <div>
          <p className="governance-panel__kicker">READ-ONLY DIAGNOSTICS</p>
          <h2>数据健康检查</h2>
          <p>检查数据库迁移、附件完整性、调度器和最近成功备份，不会自动修改数据。</p>
        </div>
        <div className="governance-panel__actions">
          <Button onClick={onDeepScan}>深度扫描</Button>
          <Button theme="solid" loading={loading} onClick={onRefresh}>重新检查</Button>
        </div>
      </header>
      {!report && !loading ? <Empty title="暂时没有检查结果" /> : null}
      <div className="governance-health-grid">
        {report?.checks.map((check) => {
          const meta = CHECK_META[check.status]
          return (
            <article className={`governance-health governance-health--${check.status.toLowerCase()}`} key={check.key}>
              <div><span>{check.label}</span><Tag color={meta.color}>{meta.label}</Tag></div>
              <p>{check.detail}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
