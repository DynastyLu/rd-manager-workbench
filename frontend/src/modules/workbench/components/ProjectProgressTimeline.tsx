import { Progress, Tag } from '@douyinfe/semi-ui'

import type { Milestone, ProjectProgressSummary } from '@/modules/workbench/types'

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('zh-CN').format(new Date(value)) : '未设置'

const scheduleCopy = (summary: ProjectProgressSummary) => {
  if (summary.scheduleState === 'UNPLANNED' || summary.variancePercent === null) {
    return '项目周期尚未完整设置'
  }
  if (summary.scheduleState === 'AHEAD') return `领先 ${Math.abs(summary.variancePercent)}%`
  if (summary.scheduleState === 'BEHIND') return `滞后 ${Math.abs(summary.variancePercent)}%`
  return '进度与时间基本一致'
}

export function ProjectProgressTimeline({
  summary,
  milestones,
  onSelectMilestone,
  onDeleteMilestone,
}: {
  summary: ProjectProgressSummary
  milestones: Milestone[]
  onSelectMilestone?: (milestone: Milestone) => void
  onDeleteMilestone?: (milestone: Milestone) => void
}) {
  return (
    <section className="project-progress" aria-label="项目周期进度">
      <div className="project-progress__summary">
        <div>
          <span>项目实际进度</span>
          <strong>{summary.actualPercent === null ? '未规划' : `${summary.actualPercent}%`}</strong>
          <Progress percent={summary.actualPercent ?? 0} showInfo={false} />
        </div>
        <div>
          <span>时间进度</span>
          <strong>{summary.timePercent === null ? '未设置' : `${summary.timePercent}%`}</strong>
          <small>
            {summary.timePercent === null ? '请补充项目计划周期' : `时间已过 ${summary.timePercent}%`}
          </small>
        </div>
        <div>
          <span>进度偏差</span>
          <strong className={`project-progress__variance project-progress__variance--${summary.scheduleState.toLowerCase()}`}>
            {scheduleCopy(summary)}
          </strong>
          <small>{summary.weightMode === 'EQUAL' ? '里程碑平均权重' : '里程碑自定义权重'}</small>
        </div>
      </div>

      {milestones.length ? (
        <ol className="project-progress__rail">
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className={summary.currentMilestoneId === milestone.id ? 'is-current' : ''}
            >
              <button type="button" onClick={() => onSelectMilestone?.(milestone)}>
                <span className="project-progress__node">
                  {milestone.status === 'COMPLETED' ? '✓' : Math.round(milestone.completionPercent)}
                </span>
                <strong>{milestone.name}</strong>
                <small>{formatDate(milestone.plannedStartAt)} — {formatDate(milestone.plannedEndAt)}</small>
                <span>{milestone.completionPercent}% · 权重 {milestone.effectiveWeightPercent}%</span>
                <Tag size="small" color={milestone.completionSource === 'TASKS' ? 'blue' : 'grey'}>
                  {milestone.completionSource === 'TASKS'
                    ? `${milestone.linkedTaskCount} 个工作项自动计算`
                    : '手工进度'}
                </Tag>
              </button>
              <button
                type="button"
                className="project-progress__delete"
                onClick={() => onDeleteMilestone?.(milestone)}
                aria-label={`删除里程碑：${milestone.name}`}
              >
                删除
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="project-workspace__muted">尚未创建里程碑，项目进度暂不计算。</p>
      )}
    </section>
  )
}
