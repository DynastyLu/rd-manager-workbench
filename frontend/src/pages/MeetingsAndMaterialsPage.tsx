import { PlannedModuleState } from '@/components/AppShell/PlannedModuleState'
import { MeetingsWorkspace } from './MeetingsPage'

export default function MeetingsAndMaterialsPage() {
  return (
    <div className="workspace-page meetings-materials-page">
      <div className="workspace-page__inner grid gap-4">
        <div className="workspace-page__hero-card">
          <header className="app-page__hero">
            <div>
              <p className="app-page__eyebrow">Meetings &amp; Materials</p>
              <h1 className="app-page__title">会议与资料</h1>
              <p className="app-page__subtitle">从会议记录进入行动项管理，并逐步补齐资料能力。</p>
            </div>
          </header>
        </div>

        <section aria-label="规划中的会议资料能力" className="grid gap-3 md:grid-cols-2">
          <PlannedModuleState
            title="附件中心"
            description="统一管理会议及项目的本地附件。"
            nextStep="下一步：梳理附件索引与关联记录的方式。"
          />
          <PlannedModuleState
            title="会议纪要模板"
            description="沉淀可复用的会议纪要字段与模板。"
            nextStep="下一步：确认模板与会议记录之间的映射。"
          />
        </section>

        <section aria-label="会议模块">
          <MeetingsWorkspace />
        </section>
      </div>
    </div>
  )
}
