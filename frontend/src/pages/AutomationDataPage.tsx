import { PlannedModuleState } from '@/components/AppShell/PlannedModuleState'

const plannedModules = [
  '提醒',
  '全局搜索',
  'Excel/CSV 导入导出',
  '备份恢复',
  '审计',
  'AI',
  '外部集成',
  'LAN',
]

export default function AutomationDataPage() {
  return (
    <div className="workspace-page automation-data-page">
      <div className="workspace-page__inner grid gap-4">
        <PlannedModuleState
          title="自动化与数据能力"
          description="围绕本地研发工作流逐步建设自动化与数据管理能力。"
          nextStep="下一步：按本地使用优先级拆分首批能力。"
        />

        <section aria-label="规划中的自动化与数据模块" className="workspace-card p-4">
          <h2 className="font-medium text-[var(--workspace-text)]">规划模块</h2>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--workspace-text-secondary)] sm:grid-cols-2">
            {plannedModules.map((module) => (
              <li key={module}>{module}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
