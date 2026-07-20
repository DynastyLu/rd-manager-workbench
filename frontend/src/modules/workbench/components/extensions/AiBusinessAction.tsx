import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Modal, Tag } from '@douyinfe/semi-ui'
import { IconBolt } from '@douyinfe/semi-icons'
import { toast } from 'sonner'

import {
  adoptAiResult,
  completeExtensionRun,
  listExtensionProfiles,
  prepareAiRequest,
  startExtensionRun,
  type AiOperation,
  type PreparedAiRequest,
} from '@/modules/workbench/api/extensions'
import { AiConsentDialog } from './AiConsentDialog'
import './AiBusinessAction.less'

interface AiBusinessActionProps {
  operation: AiOperation
  objectId?: string
  objectLabel: string
  buttonLabel: string
  adoptLabel: string
  question?: string
  title?: string
  spaceId?: string
  onAdopted?: () => void | Promise<void>
}

interface AiSuggestion {
  runId: string
  output: Record<string, unknown>
  citationIds: string[]
}

function suggestionText(output: Record<string, unknown>) {
  if (typeof output.summary === 'string' && output.summary.trim()) return output.summary
  if (typeof output.answer === 'string') return output.answer
  return 'AI 已返回结构化建议。'
}

export function AiBusinessAction({
  operation,
  objectId,
  objectLabel,
  buttonLabel,
  adoptLabel,
  question,
  title,
  spaceId,
  onAdopted,
}: AiBusinessActionProps) {
  const queryClient = useQueryClient()
  const [prepared, setPrepared] = useState<PreparedAiRequest | null>(null)
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [adopting, setAdopting] = useState(false)
  const desktopExtensions = window.rdWorkbenchDesktop?.extensions
  const profilesQuery = useQuery({
    queryKey: ['extensions', 'profiles', 'AI'],
    queryFn: () => listExtensionProfiles('AI'),
  })
  const profile = useMemo(
    () => profilesQuery.data?.find((item) => item.enabled && item.permissions.includes(operation)),
    [operation, profilesQuery.data],
  )
  const questionMissing = operation === 'AI_KNOWLEDGE_QA' && !question?.trim()
  const disabled = !desktopExtensions || !profile || questionMissing || preparing

  const begin = async () => {
    if (!profile) return
    setPreparing(true)
    try {
      setPrepared(await prepareAiRequest({
        profileId: profile.id,
        operation,
        ...(objectId ? { objectId } : {}),
        ...(question?.trim() ? { question: question.trim() } : {}),
      }))
    } catch {
      toast.error('AI 预检失败，请检查服务配置和当前内容。')
    } finally {
      setPreparing(false)
    }
  }

  const execute = async () => {
    if (!profile || !prepared || !desktopExtensions) return
    setExecuting(true)
    try {
      const started = await startExtensionRun(profile.id, {
        operation,
        payload: prepared.payload,
        confirmationHash: prepared.confirmationHash,
      })
      if (!started.completionToken) throw new Error('EXTENSION_COMPLETION_TOKEN_MISSING')
      const result = await desktopExtensions.execute({
        runId: started.id,
        profile,
        operation,
        payload: prepared.payload,
      })
      await completeExtensionRun(started.id, {
        completionToken: started.completionToken,
        status: result.status,
        ...(result.output ? { output: result.output } : {}),
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.metadata ? { metadata: result.metadata } : {}),
      })
      if (result.status !== 'SUCCEEDED' || !result.output) {
        throw new Error(result.errorCode ?? 'AI_EXECUTION_FAILED')
      }
      setSuggestion({ runId: started.id, output: result.output, citationIds: prepared.payload.citationIds })
      setPrepared(null)
    } catch {
      toast.error('AI 执行失败；当前纪要或文档没有被修改。')
    } finally {
      setExecuting(false)
    }
  }

  const adopt = async () => {
    if (!suggestion) return
    setAdopting(true)
    try {
      await adoptAiResult({
        runId: suggestion.runId,
        operation,
        ...(objectId ? { objectId } : {}),
        citationIds: suggestion.citationIds,
        output: suggestion.output,
        ...(title ? { title } : {}),
        ...(spaceId ? { spaceId } : {}),
      })
      setSuggestion(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meetings'] }),
        queryClient.invalidateQueries({ queryKey: ['meeting', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
        queryClient.invalidateQueries({ queryKey: ['document', objectId] }),
      ])
      await onAdopted?.()
      toast.success('AI 建议已采纳')
    } catch {
      toast.error('采纳失败，原内容保持不变。')
    } finally {
      setAdopting(false)
    }
  }

  return (
    <span className="ai-business-action">
      <Button
        icon={<IconBolt />}
        loading={preparing}
        disabled={disabled}
        aria-label={buttonLabel}
        onClick={() => { void begin() }}
      >
        {buttonLabel}
      </Button>
      {!desktopExtensions ? <small>请在 Electron 桌面端使用 AI</small> : null}
      {desktopExtensions && !profilesQuery.isPending && !profile ? <small>请先在设置中启用支持此能力的 AI 服务</small> : null}

      <AiConsentDialog
        visible={Boolean(prepared)}
        provider={prepared?.provider ?? ''}
        objectLabel={objectLabel}
        characterCount={prepared?.disclosure.characterCount ?? 0}
        submitting={executing}
        onCancel={() => setPrepared(null)}
        onConfirm={() => { void execute() }}
      />

      <Modal
        visible={Boolean(suggestion)}
        title="AI 建议预览"
        onCancel={() => setSuggestion(null)}
        footer={(
          <div className="extension-dialog__actions">
            <Button onClick={() => setSuggestion(null)}>暂不采纳</Button>
            <Button theme="solid" type="primary" loading={adopting} onClick={() => { void adopt() }}>{adoptLabel}</Button>
          </div>
        )}
      >
        <Banner type="info" fullMode={false} closeIcon={null} title="采纳前不会改动原内容" description="请检查事实、日期和行动项；AI 结果可能不准确。" />
        <div className="ai-business-action__suggestion">{suggestion ? suggestionText(suggestion.output) : null}</div>
        <div className="ai-business-action__citations">
          {suggestion?.citationIds.map((citation) => <Tag key={citation}>{citation}</Tag>)}
        </div>
      </Modal>
    </span>
  )
}
