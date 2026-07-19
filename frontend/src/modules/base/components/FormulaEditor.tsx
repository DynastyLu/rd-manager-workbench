import { useEffect, useRef, useState } from 'react'
import { Button } from '@douyinfe/semi-ui'

import { ApiError } from '@/lib/http'
import { previewBaseFormula } from '../api'
import type { DataField, FormulaPreviewInput, FormulaPreviewResult } from '../types'

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '空值'
  if (Array.isArray(value)) return value.join('、') || '空值'
  if (typeof value === 'object') return JSON.stringify(value)
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  )
    return String(value)
  return '无法显示'
}

function errorPosition(message: string) {
  const match = message.match(/(?:position|位置)\s*(\d+)/i)
  return match?.[1]
}

function detailPosition(error: ApiError) {
  if (typeof error.details !== 'object' || error.details === null || !('position' in error.details))
    return undefined
  const position = (error.details as { position?: unknown }).position
  return typeof position === 'number' ? String(position) : undefined
}

export function FormulaEditor({
  tableId,
  fields,
  value,
  identity,
  recordId,
  onChange,
  preview = previewBaseFormula,
}: {
  tableId: string
  fields: DataField[]
  value: string
  identity?: string
  recordId?: string
  onChange: (value: string) => void
  preview?: (tableId: string, input: FormulaPreviewInput) => Promise<FormulaPreviewResult>
}) {
  const [draft, setDraft] = useState(value)
  const [result, setResult] = useState<FormulaPreviewResult | null>(null)
  const [error, setError] = useState('')
  const [pendingKey, setPendingKey] = useState('')
  const pending = useRef<{ key: string; promise: Promise<FormulaPreviewResult> } | null>(null)
  const editor = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value)
    setResult(null)
    setError('')
  }, [identity, value])

  const updateDraft = (next: string) => {
    setDraft(next)
    setResult(null)
    setError('')
    onChange(next)
  }

  const insertField = (fieldKey: string) => {
    const input = editor.current
    const hasEditorSelection = input !== null && document.activeElement === input
    const start = hasEditorSelection ? input.selectionStart : draft.length
    const end = hasEditorSelection ? input.selectionEnd : start
    const next = `${draft.slice(0, start)}{${fieldKey}}${draft.slice(end)}`
    updateDraft(next)
    window.setTimeout(() => {
      const position = start + fieldKey.length + 2
      input?.focus()
      input?.setSelectionRange(position, position)
    }, 0)
  }

  const runPreview = async () => {
    const expression = draft.trim()
    if (!expression) return
    const key = JSON.stringify({ expression, recordId: recordId ?? null })
    if (pending.current?.key === key) return undefined
    setPendingKey(key)
    setResult(null)
    setError('')
    const request = preview(tableId, { expression, ...(recordId ? { recordId } : {}) })
    pending.current = { key, promise: request }
    try {
      const next = await request
      setResult(next)
      if (next.error) setError(next.error.message)
      return next
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : '公式预览失败'
      const position =
        previewError instanceof ApiError
          ? (detailPosition(previewError) ?? errorPosition(message))
          : errorPosition(message)
      setError(position ? `${message}（位置 ${position}）` : message)
      return undefined
    } finally {
      if (pending.current?.key === key) pending.current = null
      setPendingKey('')
    }
  }

  return (
    <div className="formula-editor">
      <div className="formula-editor__fields" aria-label="可插入字段">
        <span>插入字段</span>
        {fields.map((field) => (
          <button
            key={field.id}
            type="button"
            aria-label={`插入字段：${field.name}`}
            title={`{${field.key}}`}
            onClick={() => insertField(field.key)}
          >
            {field.name}
          </button>
        ))}
      </div>
      <textarea
        ref={editor}
        aria-label="公式表达式"
        rows={5}
        value={draft}
        spellCheck={false}
        placeholder={'例如：IF({score} >= 80, "通过", "继续评估")'}
        onChange={(event) => updateDraft(event.target.value)}
      />
      <div className="formula-editor__footer">
        <Button
          type="primary"
          theme="light"
          aria-label={pendingKey ? '正在预览' : '预览公式'}
          loading={Boolean(pendingKey)}
          onClick={() => void runPreview()}
        >
          {pendingKey ? '正在预览' : '预览'}
        </Button>
        {result && !result.error ? (
          <output className="formula-editor__result">结果：{valueText(result.value)}</output>
        ) : null}
        {error ? (
          <p role="alert" className="formula-editor__error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
