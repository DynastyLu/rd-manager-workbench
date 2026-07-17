import { Route, Routes } from 'react-router-dom'

import { DashboardPage } from '@/pages/DashboardPage'
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AppShell } from '@/shell/AppShell'

const PROJECT_SCOPES = ['项目档案与里程碑', '任务依赖与进展', '健康度与提醒']
const VARIETY_SCOPES = ['申报流程与条件', '材料版本与证据', '补正、提交与结果复盘']
const RISK_SCOPES = ['风险与问题台账', '决策记录与依据', '关闭验证与来源关联']
const PARTNER_SCOPES = ['合作方与联系人', '沟通和会议纪要', '承诺与行动项']
const INTELLIGENCE_SCOPES = ['主题与来源', '情报卡片与简报', '情报到行动的转换']
const REPORT_SCOPES = ['跨域提醒', '管理报表', '导入导出与备份']

function NotFoundPage() {
  return (
    <section className="page-intro page-intro--compact">
      <p className="archive-kicker">ARCHIVE / 404</p>
      <h1>页面不存在</h1>
      <p>当前地址不在本地工作台的已批准模块清单中。</p>
    </section>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="projects"
          element={
            <ModulePlaceholderPage
              archiveCode="PROJECT / 002"
              title="项目与任务"
              description="围绕项目节点、任务依赖和管理预警建立可追踪执行链路。"
              scopes={PROJECT_SCOPES}
            />
          }
        />
        <Route
          path="varieties"
          element={
            <ModulePlaceholderPage
              archiveCode="APPLICATION / 003"
              title="品种申报"
              description="沉淀申报事项、材料版本、证据台账和补正提交记录。"
              scopes={VARIETY_SCOPES}
            />
          }
        />
        <Route
          path="risks"
          element={
            <ModulePlaceholderPage
              archiveCode="GOVERNANCE / 004"
              title="风险与决策"
              description="把风险、阻塞与关键决策纳入同一个管理闭环。"
              scopes={RISK_SCOPES}
            />
          }
        />
        <Route
          path="partners"
          element={
            <ModulePlaceholderPage
              archiveCode="COLLABORATION / 005"
              title="合作方与会议"
              description="连续记录外部协作、沟通承诺、会议结论与后续行动。"
              scopes={PARTNER_SCOPES}
            />
          }
        />
        <Route
          path="intelligence"
          element={
            <ModulePlaceholderPage
              archiveCode="INTELLIGENCE / 006"
              title="行业情报"
              description="整理可信来源、主题动态和能够转化为行动的情报。"
              scopes={INTELLIGENCE_SCOPES}
            />
          }
        />
        <Route
          path="reports"
          element={
            <ModulePlaceholderPage
              archiveCode="REPORT / 007"
              title="报表与提醒"
              description="提供跨模块检索、管理汇总、提醒和本地数据维护能力。"
              scopes={REPORT_SCOPES}
            />
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
