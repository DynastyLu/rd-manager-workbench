import { useMemo, useState } from 'react'
import {
  IconBulb,
  IconChevronDown,
  IconChevronUp,
  IconSearch,
  IconTick,
} from '@douyinfe/semi-icons'
import { motion, useReducedMotion } from 'framer-motion'
import { NovaBot } from './NovaBot'

export interface KnowledgeThinkingStep {
  phase: string
  message: string
}

interface Props {
  steps: KnowledgeThinkingStep[]
  hasAnswerContent: boolean
}

interface DisplayStep {
  key: string
  label: string
  detail?: string
  state: 'complete' | 'active' | 'warning'
  icon: 'understand' | 'search' | 'answer'
}

function buildDisplaySteps(
  steps: KnowledgeThinkingStep[],
  hasAnswerContent: boolean
): DisplayStep[] {
  if (steps.length === 0) {
    return [
      {
        key: 'understand',
        label: '正在理解问题',
        detail: '分析提问意图与知识范围',
        state: 'active',
        icon: 'understand',
      },
    ]
  }

  const searching = [...steps].reverse().find((step) => step.phase === 'searching')
  const found = [...steps].reverse().find((step) => step.phase === 'found')
  const empty = [...steps].reverse().find((step) => step.phase === 'empty')
  const result: DisplayStep[] = [
    {
      key: 'understand',
      label: '已理解问题',
      state: 'complete',
      icon: 'understand',
    },
  ]

  if (empty) {
    result.push({
      key: 'search',
      label: '知识检索完成',
      detail: empty.message,
      state: 'warning',
      icon: 'search',
    })
    return result
  }

  if (found) {
    result.push({
      key: 'search',
      label: '知识检索完成',
      detail: found.message,
      state: 'complete',
      icon: 'search',
    })
    result.push({
      key: 'answer',
      label: hasAnswerContent ? '正在生成回答' : '正在组织回答',
      detail: hasAnswerContent ? '根据引用资料持续生成内容' : '整理证据并组织回答结构',
      state: 'active',
      icon: 'answer',
    })
    return result
  }

  result.push({
    key: 'search',
    label: '检索知识库',
    detail: searching?.message ?? '正在搜索可引用的本地资料',
    state: 'active',
    icon: 'search',
  })
  return result
}

function StepIcon({ step }: { step: DisplayStep }) {
  if (step.state === 'complete') return <IconTick />
  if (step.icon === 'search') return <IconSearch />
  return <IconBulb />
}

export function KnowledgeThinkingProcess({ steps, hasAnswerContent }: Props) {
  const [expanded, setExpanded] = useState(true)
  const reduceMotion = useReducedMotion()
  const displaySteps = useMemo(
    () => buildDisplaySteps(steps, hasAnswerContent),
    [hasAnswerContent, steps]
  )
  const searching = displaySteps.some((step) => step.icon === 'search' && step.state === 'active')

  return (
    <section
      className={[
        'kb-ai-thinking',
        expanded ? 'kb-ai-thinking--expanded' : '',
        searching ? 'kb-ai-thinking--searching' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="AI 思考过程"
      aria-live="polite"
    >
      <NovaBot active label="NOVA 正在思考" />
      {searching ? <span className="kb-ai-thinking__search-glow" aria-hidden="true" /> : null}
      <div className="kb-ai-thinking__panel">
        <header>
          <div>
            <span className="kb-ai-thinking__status-dot" aria-hidden="true" />
            <strong>正在思考</strong>
            <span className="kb-ai-thinking__ellipsis" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <motion.i
                  key={dot}
                  animate={
                    reduceMotion
                      ? { opacity: 1, scale: 1, y: 0 }
                      : {
                          opacity: [0.42, 1, 0.42],
                          scale: [0.82, 1.18, 0.82],
                          y: [0, -5, 0],
                        }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : {
                          delay: dot * 0.15,
                          duration: 0.95,
                          ease: 'easeInOut',
                          repeat: Number.POSITIVE_INFINITY,
                        }
                  }
                />
              ))}
            </span>
          </div>
          <button
            type="button"
            aria-label={expanded ? '收起思考过程' : '展开思考过程'}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <IconChevronUp /> : <IconChevronDown />}
          </button>
        </header>
        {expanded ? (
          <div className="kb-ai-thinking__timeline">
            {displaySteps.map((step) => (
              <div
                key={step.key}
                className={`kb-ai-thinking__step kb-ai-thinking__step--${step.state}`}
              >
                <span className="kb-ai-thinking__step-icon" aria-hidden="true">
                  <StepIcon step={step} />
                </span>
                <div>
                  <strong>{step.label}</strong>
                  {step.detail ? <span>{step.detail}</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
