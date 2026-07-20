import { useState } from 'react'
import { Button, Empty, Input, Select, Table, Tag } from '@douyinfe/semi-ui'

import type { AuditLog } from '@/modules/workbench/api/governance'

export function AuditLogTable({
  logs,
  loading,
  onFilter,
}: {
  logs: AuditLog[]
  loading: boolean
  onFilter: (filter: { entityType?: string; outcome?: AuditLog['outcome'] }) => void
}) {
  const [entityType, setEntityType] = useState('')
  const [outcome, setOutcome] = useState<AuditLog['outcome'] | undefined>()
  return (
    <section className="governance-panel" aria-label="审计日志">
      <header className="governance-panel__header governance-panel__header--stack">
        <div>
          <p className="governance-panel__kicker">IMMUTABLE ACTIVITY</p>
          <h2>审计日志</h2>
          <p>审计只记录字段名，不保存正文、手机号或密钥。</p>
        </div>
        <div className="governance-audit-filters">
          <Input aria-label="筛选对象类型" value={entityType} onChange={setEntityType} placeholder="例如 BACKUP" />
          <Select
            aria-label="筛选执行结果"
            value={outcome}
            placeholder="全部结果"
            showClear
            onChange={(value) => setOutcome(value as AuditLog['outcome'] | undefined)}
            optionList={[
              { label: '成功', value: 'SUCCEEDED' },
              { label: '失败', value: 'FAILED' },
            ]}
          />
          <Button theme="solid" onClick={() => onFilter({ entityType: entityType || undefined, outcome })}>查询审计</Button>
        </div>
      </header>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={logs}
        pagination={false}
        empty={<Empty title="没有匹配的审计记录" />}
        columns={[
          { title: '时间', dataIndex: 'occurredAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
          { title: '动作', dataIndex: 'action' },
          { title: '对象', render: (_: unknown, log: AuditLog) => `${log.entityType}${log.entityId ? ` · ${log.entityId}` : ''}` },
          { title: '变更字段', dataIndex: 'changedFields', render: (value: string[]) => value.length ? value.join('、') : '—' },
          { title: '结果', dataIndex: 'outcome', render: (value: AuditLog['outcome']) => <Tag color={value === 'SUCCEEDED' ? 'green' : 'red'}>{value === 'SUCCEEDED' ? '成功' : '失败'}</Tag> },
        ]}
      />
    </section>
  )
}
