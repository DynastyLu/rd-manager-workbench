import { useState, type FocusEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Checkbox, Empty, Skeleton, Tag } from '@douyinfe/semi-ui'
import { IconChevronDown, IconChevronUp, IconFolderStroked } from '@douyinfe/semi-icons'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  adoptProjectProgressDraft,
  generateProjectProgressDrafts,
  ignoreProjectProgressDraft,
  listProjectProgressDrafts,
} from '../api'
import type { ProjectProgressDraft, ProjectProgressDraftContentLine } from '../types'
import './ProjectProgressDrafts.less'

const STATUS_LABEL = {
  PENDING: '待确认',
  ADOPTED: '已采纳',
  IGNORED: '已忽略',
  INVALIDATED: '来源已失效',
} as const

function DraftLines({
  title,
  lines,
  emptyText,
}: {
  title: string
  lines: ProjectProgressDraftContentLine[]
  emptyText: string
}) {
  return (
    <section>
      <h5>{title}</h5>
      {lines.length ? (
        <ul>
          {lines.map((line) => (
            <li key={line.sourceId}>
              {line.employeeName}：{line.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-progress-drafts__muted">{emptyText}</p>
      )}
    </section>
  )
}

const FOLDER_SPRING = {
  type: 'spring',
  stiffness: 360,
  damping: 34,
  mass: 0.82,
} as const

function DraftFolder({
  draft,
  versionCount,
  expanded,
  createRisks,
  createTasks,
  canPublish,
  onAdopt,
  onIgnore,
  onToggle,
  onMouseEnter,
  onMouseLeave,
  onFocusCapture,
  onBlurCapture,
  adopting,
  ignoring,
}: {
  draft: ProjectProgressDraft
  versionCount: number
  expanded: boolean
  createRisks: boolean
  createTasks: boolean
  canPublish: boolean
  onAdopt: () => void
  onIgnore: () => void
  onToggle: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocusCapture: () => void
  onBlurCapture: (event: FocusEvent<HTMLElement>) => void
  adopting: boolean
  ignoring: boolean
}) {
  const detailsId = `project-progress-draft-${draft.id}`

  return (
    <motion.article
      layout
      className={`project-progress-drafts__folder${expanded ? ' project-progress-drafts__folder--expanded' : ''}`}
      data-project-code={draft.project.code}
      animate={{ y: expanded ? -4 : 0, scale: expanded ? 1.006 : 1 }}
      transition={FOLDER_SPRING}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      <button
        type="button"
        className="project-progress-drafts__folder-tab"
        aria-label={`${draft.project.name}项目文件夹`}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <span className="project-progress-drafts__folder-icon" aria-hidden="true">
          <IconFolderStroked />
        </span>
        <span className="project-progress-drafts__folder-identity">
          <span className="project-progress-drafts__project">{draft.project.code}</span>
          <strong>{draft.project.name}</strong>
          <small>{draft.summary}</small>
        </span>
        <span className="project-progress-drafts__folder-signals">
          {versionCount > 1 ? <span>{versionCount - 1} 个历史版本</span> : null}
          <span>{draft.content.completed.length} 项完成</span>
          <span>{draft.content.nextPlans.length} 项计划</span>
          {draft.content.risks.length || draft.content.blockers.length ? (
            <span className="project-progress-drafts__folder-signal--warning">
              {draft.content.risks.length + draft.content.blockers.length} 项关注
            </span>
          ) : null}
        </span>
        <Tag
          className="project-progress-drafts__status"
          color={
            draft.status === 'ADOPTED' ? 'green' : draft.status === 'PENDING' ? 'blue' : 'grey'
          }
        >
          {STATUS_LABEL[draft.status]}
        </Tag>
        <span className="project-progress-drafts__folder-chevron" aria-hidden="true">
          {expanded ? <IconChevronUp /> : <IconChevronDown />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={detailsId}
            className="project-progress-drafts__folder-body"
            initial={{ height: 0, opacity: 0, y: -12 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -8 }}
            transition={{
              height: FOLDER_SPRING,
              opacity: { duration: 0.16, delay: 0.04 },
              y: FOLDER_SPRING,
            }}
          >
            <div className="project-progress-drafts__folder-body-inner">
              <div className="project-progress-drafts__source">
                <span>
                  {draft.periodStartAt.slice(0, 10)} — {draft.periodEndAt.slice(0, 10)}
                </span>
                <span>
                  来源：批次 {draft.sourceBatchId} · 版本 {draft.sourceVersion}
                </span>
              </div>

              <div className="project-progress-drafts__sections">
                <DraftLines
                  title="本周完成"
                  lines={draft.content.completed}
                  emptyText="本周期没有已完成事项"
                />
                <DraftLines
                  title="下周计划"
                  lines={draft.content.nextPlans}
                  emptyText="暂未填写下周计划"
                />
                <DraftLines title="阻塞" lines={draft.content.blockers} emptyText="未发现阻塞" />
                <DraftLines title="风险" lines={draft.content.risks} emptyText="未发现风险" />
              </div>

              <div className="project-progress-drafts__hours">
                <strong>工时</strong>
                <span>
                  本周计划 {draft.content.hours.planned}h · 实际 {draft.content.hours.actual}h ·
                  下周计划 {draft.content.hours.nextPlanned}h
                </span>
                {draft.content.hours.missingCount ? (
                  <span>{draft.content.hours.missingCount} 项工时不完整</span>
                ) : null}
              </div>

              {draft.content.unlinkedRows.length ? (
                <details className="project-progress-drafts__unlinked">
                  <summary>{draft.unlinkedRowCount} 行未关联数据</summary>
                  <ul>
                    {draft.content.unlinkedRows.map((row) => (
                      <li key={row.sourceId}>
                        第 {row.rowNumber} 行 · {row.employeeName ?? '未知员工'} · {row.title}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {draft.status === 'PENDING' && canPublish ? (
                <footer>
                  <Button
                    theme="solid"
                    type="primary"
                    loading={adopting}
                    disabled={ignoring}
                    onClick={onAdopt}
                  >
                    采纳为正式进展
                  </Button>
                  <Button
                    theme="borderless"
                    loading={ignoring}
                    disabled={adopting}
                    onClick={onIgnore}
                  >
                    忽略
                  </Button>
                  <span className="project-progress-drafts__choice-summary">
                    {createRisks ? '将创建风险' : '不创建风险'} ·{' '}
                    {createTasks ? '将创建任务' : '不创建任务'}
                  </span>
                </footer>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  )
}

export function ProjectProgressDrafts({
  projectId,
  sourceBatchId,
  canPublish = true,
}: {
  projectId?: string
  sourceBatchId?: string
  canPublish?: boolean
}) {
  const queryClient = useQueryClient()
  const [createRisks, setCreateRisks] = useState(false)
  const [createTasks, setCreateTasks] = useState(false)
  const [hoveredDraftId, setHoveredDraftId] = useState<string | null>(null)
  const [focusedDraftId, setFocusedDraftId] = useState<string | null>(null)
  const [pinnedDraftId, setPinnedDraftId] = useState<string | null>(null)
  const expandedDraftId = hoveredDraftId ?? focusedDraftId ?? pinnedDraftId
  const queryKey = ['project-progress-drafts', projectId, sourceBatchId]
  const drafts = useQuery({
    queryKey,
    queryFn: () => listProjectProgressDrafts({ projectId, sourceBatchId }),
  })
  const generate = useMutation({
    mutationFn: () => generateProjectProgressDrafts(sourceBatchId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-progress-drafts'] })
      toast.success('已重新生成项目进展草稿')
    },
    onError: () => toast.error('生成项目进展草稿失败，请重试。'),
  })
  const adopt = useMutation({
    mutationFn: (draftId: string) =>
      adoptProjectProgressDraft(draftId, { createRisks, createTasks }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['project-progress-drafts'] })
      toast.success(result.alreadyAdopted ? '该草稿已采纳' : '已写入正式项目进展')
    },
    onError: () => toast.error('采纳失败，请刷新来源后重试。'),
  })
  const ignore = useMutation({
    mutationFn: ignoreProjectProgressDraft,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-progress-drafts'] })
      toast.success('已忽略草稿')
    },
    onError: () => toast.error('忽略失败，请重试。'),
  })
  const projectFolders = Array.from(
    (drafts.data ?? [])
      .reduce((groups, draft) => {
        const current = groups.get(draft.projectId)
        if (!current) {
          groups.set(draft.projectId, { draft, versionCount: 1 })
          return groups
        }

        current.versionCount += 1
        if (
          draft.sourceVersion > current.draft.sourceVersion ||
          (draft.sourceVersion === current.draft.sourceVersion &&
            draft.updatedAt > current.draft.updatedAt)
        ) {
          current.draft = draft
        }
        return groups
      }, new Map<string, { draft: ProjectProgressDraft; versionCount: number }>())
      .values()
  ).sort((left, right) => right.draft.updatedAt.localeCompare(left.draft.updatedAt))

  return (
    <section className="project-progress-drafts" aria-label="项目进展草稿">
      <header className="project-progress-drafts__header">
        <div>
          <span className="project-progress-drafts__eyebrow">项目归档夹</span>
          <h3>项目进展草稿</h3>
          <p>由员工周报按项目整理，确认前不会写入正式进展。</p>
        </div>
        <div className="project-progress-drafts__controls">
          <Checkbox
            aria-label="同时创建风险"
            checked={createRisks}
            onChange={(event) => setCreateRisks(Boolean(event.target.checked))}
          >
            采纳时创建风险
          </Checkbox>
          <Checkbox
            aria-label="同时创建任务"
            checked={createTasks}
            onChange={(event) => setCreateTasks(Boolean(event.target.checked))}
          >
            采纳时创建任务
          </Checkbox>
          {sourceBatchId ? (
            <Button loading={generate.isPending} onClick={() => generate.mutate()}>
              重新生成
            </Button>
          ) : null}
        </div>
      </header>

      {drafts.isPending ? <Skeleton loading placeholder={<Skeleton.Paragraph rows={5} />} /> : null}
      {drafts.isError ? (
        <Banner
          type="danger"
          fullMode={false}
          title="无法读取项目进展草稿"
          description="请检查来源批次或本地服务后重试。"
          closeIcon={null}
        >
          <Button onClick={() => void drafts.refetch()}>重试</Button>
        </Banner>
      ) : null}
      {drafts.data?.length === 0 ? (
        <Empty title="暂无进展草稿" description="完成员工周报导入后，系统会按关联项目自动生成。" />
      ) : null}
      <MotionConfig reducedMotion="user">
        <div className="project-progress-drafts__list">
          {projectFolders.map(({ draft, versionCount }) => (
            <DraftFolder
              key={draft.id}
              draft={draft}
              versionCount={versionCount}
              expanded={expandedDraftId === draft.id}
              createRisks={createRisks}
              createTasks={createTasks}
              canPublish={canPublish}
              adopting={adopt.isPending && adopt.variables === draft.id}
              ignoring={ignore.isPending && ignore.variables === draft.id}
              onMouseEnter={() => setHoveredDraftId(draft.id)}
              onMouseLeave={() =>
                setHoveredDraftId((current) => (current === draft.id ? null : current))
              }
              onFocusCapture={() => setFocusedDraftId(draft.id)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setFocusedDraftId((current) => (current === draft.id ? null : current))
                }
              }}
              onToggle={() =>
                setPinnedDraftId((current) => (current === draft.id ? null : draft.id))
              }
              onAdopt={() => adopt.mutate(draft.id)}
              onIgnore={() => ignore.mutate(draft.id)}
            />
          ))}
        </div>
      </MotionConfig>
    </section>
  )
}
