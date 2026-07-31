import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Banner, Button, Empty, Skeleton } from '@douyinfe/semi-ui'
import { Link } from 'react-router-dom'
import { WorkspaceSelect } from '@/components/workspace/WorkspaceSelect'
import {
  listActivities,
  type ActivityActorKind,
  type ActivityRecord,
} from '../api'
import './ActivityTimeline.less'

const TYPE_LABELS: Record<string, string> = {
  WORK_TASK: '工作项',
  PROJECT_PROGRESS_DRAFT: '项目进展草稿',
  EMPLOYEE_WORK_IMPORT: '员工周报',
  MEETING: '会议',
  MEETING_ACTION: '会议行动项',
  RISK: '风险',
  DOCUMENT: '文档',
  PROJECT: '项目',
  PROGRESS_REPORT: '项目进展',
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function actorLabel(activity: ActivityRecord) {
  if (activity.actorKind === 'AUTOMATION') return '自动操作'
  if (activity.actorKind === 'SYSTEM') return '系统操作'
  return activity.actorName || '人工操作'
}

function activityFrom(days: string) {
  if (days === 'all') return undefined
  return new Date(Date.now() - Number(days) * 86_400_000).toISOString()
}

export function ActivityTimeline({
  projectId,
  employeeId,
  limit = 20,
}: {
  projectId?: string
  employeeId?: string
  limit?: number
}) {
  const [objectType, setObjectType] = useState('')
  const [actorKind, setActorKind] = useState<ActivityActorKind | ''>('')
  const [days, setDays] = useState('7')
  const [from, setFrom] = useState<string | undefined>(() => activityFrom('7'))
  const query = useInfiniteQuery({
    queryKey: ['activities', projectId, employeeId, objectType, actorKind, from, limit],
    queryFn: ({ pageParam }) =>
      listActivities({
        projectId,
        employeeId,
        objectType: objectType || undefined,
        actorKind: actorKind || undefined,
        from,
        cursor: pageParam,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(projectId || employeeId) && (days === 'all' || Boolean(from)),
  })
  const activities = query.data?.pages.flatMap((page) => page.data) ?? []

  return (
    <section className="activity-timeline" aria-label="活动时间线">
      <header className="activity-timeline__header">
        <div>
          <span className="activity-timeline__eyebrow">ACTIVITY LOG</span>
          <h3>最近发生了什么</h3>
        </div>
        <div className="activity-timeline__filters">
          <div className="activity-timeline__filter">
            <span id="activity-type-label">类型</span>
            <WorkspaceSelect
              aria-labelledby="activity-type-label"
              value={objectType}
              emptyLabel="全部类型"
              onChange={setObjectType}
              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </div>
          <div className="activity-timeline__filter">
            <span id="activity-actor-label">来源</span>
            <WorkspaceSelect
              aria-labelledby="activity-actor-label"
              value={actorKind}
              emptyLabel="全部来源"
              onChange={(value) => setActorKind(value as ActivityActorKind | '')}
              options={[
                { value: 'HUMAN', label: '人工' },
                { value: 'AUTOMATION', label: '自动' },
                { value: 'SYSTEM', label: '系统' },
              ]}
            />
          </div>
          <div className="activity-timeline__filter">
            <span id="activity-time-label">时间</span>
            <WorkspaceSelect
              aria-labelledby="activity-time-label"
              value={days}
              onChange={(value) => {
                const nextDays = value || '7'
                setDays(nextDays)
                setFrom(activityFrom(nextDays))
              }}
              options={[
                { value: '7', label: '近 7 天' },
                { value: '30', label: '近 30 天' },
                { value: '90', label: '近 90 天' },
                { value: 'all', label: '全部' },
              ]}
            />
          </div>
        </div>
      </header>

      {query.isPending ? (
        <Skeleton loading placeholder={<Skeleton.Paragraph rows={4} />} />
      ) : null}
      {query.isError ? (
        <Banner
          type="danger"
          fullMode={false}
          title="无法读取活动记录"
          description="请检查本地服务后重试。"
          closeIcon={null}
        >
          <Button onClick={() => void query.refetch()}>重试</Button>
        </Banner>
      ) : null}
      {!query.isPending && !query.isError && activities.length === 0 ? (
        <Empty title="暂无活动" description="后续任务、会议和周报变化会出现在这里。" />
      ) : null}
      {activities.length > 0 ? (
        <ol className="activity-timeline__list">
          {activities.map((activity) => (
            <li key={activity.id}>
              <span
                className={`activity-timeline__dot activity-timeline__dot--${activity.actorKind.toLowerCase()}`}
                aria-hidden="true"
              />
              <article>
                <div className="activity-timeline__meta">
                  <span>{TYPE_LABELS[activity.objectType] ?? activity.objectType}</span>
                  <span className={`activity-timeline__actor activity-timeline__actor--${activity.actorKind.toLowerCase()}`}>
                    {actorLabel(activity)}
                  </span>
                  <time dateTime={activity.occurredAt}>{formatTime(activity.occurredAt)}</time>
                </div>
                <p>{activity.summary}</p>
                <Link to={activity.sourcePath}>查看原对象</Link>
              </article>
            </li>
          ))}
        </ol>
      ) : null}
      {query.hasNextPage ? (
        <Button
          className="activity-timeline__more"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          加载更早记录
        </Button>
      ) : null}
    </section>
  )
}
