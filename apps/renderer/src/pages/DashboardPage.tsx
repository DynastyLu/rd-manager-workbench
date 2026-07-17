import type { LucideIcon } from 'lucide-react'
import BookOpenCheckIcon from 'lucide-react/dist/esm/icons/book-open-check.js'
import CalendarCheck2Icon from 'lucide-react/dist/esm/icons/calendar-check-2.js'
import RadarIcon from 'lucide-react/dist/esm/icons/radar.js'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert.js'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface DashboardModule {
  title: string
  description: string
  scope: string
  archiveCode: string
  icon: LucideIcon
}

const DASHBOARD_MODULES: DashboardModule[] = [
  {
    title: '今日行动',
    description: '后续汇总任务、会议行动项和外部回复期限。',
    scope: '任务 · 会议 · 跟进',
    archiveCode: 'A-01',
    icon: CalendarCheck2Icon,
  },
  {
    title: '项目预警',
    description: '后续呈现逾期里程碑、关键任务和高风险原因。',
    scope: '里程碑 · 健康度 · 风险',
    archiveCode: 'A-02',
    icon: TriangleAlertIcon,
  },
  {
    title: '申报节点',
    description: '后续跟踪材料完整度、条件缺口和倒排节点。',
    scope: '条件 · 材料 · 提交',
    archiveCode: 'A-03',
    icon: BookOpenCheckIcon,
  },
  {
    title: '情报摘要',
    description: '后续汇总本地采集的高优先级行业情报。',
    scope: '主题 · 来源 · 行动',
    archiveCode: 'A-04',
    icon: RadarIcon,
  },
]

export function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="archive-kicker">LOCAL R&amp;D OPERATIONS / 001</p>
          <h1>研发主管工作台</h1>
          <p>把项目推进、申报材料、管理风险和行业情报收束到一张本地案头。</p>
        </div>
        <div className="intro-filing-mark" aria-label="当前阶段：工程骨架">
          <span>当前卷宗</span>
          <strong>工程骨架</strong>
          <small>业务数据尚未启用</small>
        </div>
      </section>

      <section className="module-grid" aria-label="工作台模块预览">
        {DASHBOARD_MODULES.map(({ title, description, scope, archiveCode, icon: Icon }) => (
          <Card key={title} size="sm">
            <CardHeader>
              <div className="module-icon" aria-hidden="true">
                <Icon />
              </div>
              <CardAction>
                <Badge variant="secondary">尚未接入</Badge>
              </CardAction>
              <CardTitle>
                <h2>{title}</h2>
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="module-scope">接入范围：{scope}</p>
            </CardContent>
            <CardFooter>
              <span>档案号 {archiveCode}</span>
              <span>等待业务子项目</span>
            </CardFooter>
          </Card>
        ))}
      </section>

      <section className="working-principle" aria-labelledby="principle-title">
        <div>
          <p className="archive-kicker">DESK RULE / 本地工作原则</p>
          <h2 id="principle-title">先记录，再关联，最后复盘</h2>
        </div>
        <Separator orientation="vertical" className="principle-separator" />
        <p>每一项风险、会议结论与情报，都将在后续业务模块中保留来源并转化为可追踪行动。</p>
      </section>
    </div>
  )
}
