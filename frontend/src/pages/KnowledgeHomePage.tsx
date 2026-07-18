import { PlannedModuleState } from '@/components/AppShell/PlannedModuleState'

export default function KnowledgeHomePage() {
  return (
    <div className="app-page">
      <div className="app-page__inner grid gap-4">
        <header className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Local Knowledge Base</p>
            <h1 className="app-page__title">知识库</h1>
            <p className="app-page__subtitle">本地知识库能力正在规划，当前不会读取或请求知识库数据。</p>
          </div>
        </header>

        <PlannedModuleState
          title="本地知识库"
          description="以本地记录为基础，逐步沉淀研发过程中的可复用知识。"
          nextStep="下一步：确定本地文件与索引的最小数据结构。"
        />

        <section aria-label="知识库规划范围" className="rounded-xl border p-4">
          <h2 className="font-medium">规划范围</h2>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <li>知识页、目录与标签</li>
            <li>项目、会议、情报、任务与附件关联</li>
            <li>全文搜索</li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            暂不包含多人协作、云同步或飞书导入。
          </p>
        </section>
      </div>
    </div>
  )
}
