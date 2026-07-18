import { Link } from 'react-router-dom'

import { PlannedModuleState } from '@/components/AppShell/PlannedModuleState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/constants/routes'

const availableModules = [
  { title: '申报认定', to: ROUTES.APPLICATIONS, description: '管理申报与认定事项。' },
  { title: '风险', to: ROUTES.governance('risks'), description: '跟踪研发风险。' },
  { title: '问题', to: ROUTES.governance('issues'), description: '记录待处理的问题。' },
  { title: '决策', to: ROUTES.governance('decisions'), description: '沉淀关键决策。' },
  { title: '合作方', to: ROUTES.governance('partners'), description: '维护合作方信息。' },
]

export default function LibraryHomePage() {
  return (
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide grid gap-4">
        <header className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Business Library</p>
            <h1 className="app-page__title">业务库</h1>
            <p className="app-page__subtitle">集中进入当前已可用的业务记录与治理模块。</p>
          </div>
        </header>

        <section aria-labelledby="available-library-modules" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <h2 id="available-library-modules" className="sr-only">
            已可用模块
          </h2>
          {availableModules.map((module) => (
            <Card key={module.to}>
              <CardHeader>
                <CardTitle>
                  <Link to={module.to}>{module.title}</Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section aria-label="规划中的业务库模块" className="grid gap-3 md:grid-cols-2">
          <PlannedModuleState
            title="行业情报"
            description="行业与竞品情报将在本地工作区中统一整理。"
            nextStep="下一步：确认情报条目的分类和来源记录方式。"
          />
          <PlannedModuleState
            title="非项目研发"
            description="非项目研发活动将与项目研发记录保持清晰边界。"
            nextStep="下一步：梳理活动、成果与投入的最小记录字段。"
          />
        </section>
      </div>
    </div>
  )
}
