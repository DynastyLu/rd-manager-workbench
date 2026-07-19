import { useState, type CSSProperties, type KeyboardEvent } from 'react'

import type { BaseRecord, ComputedFieldError, DataField, GalleryViewConfig } from '../types'

function safeHttpUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function attachmentUrl(value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : []
  for (const item of items) {
    const rawUrl = typeof item === 'string'
      ? item
      : item && typeof item === 'object' && 'url' in item
        ? (item as { url?: unknown }).url
        : undefined
    const url = safeHttpUrl(rawUrl)
    if (!url) continue
    const mimeType = item && typeof item === 'object' && 'mimeType' in item
      ? (item as { mimeType?: unknown }).mimeType
      : undefined
    if (typeof mimeType === 'string' && mimeType.startsWith('image/')) return url
    if (/\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(url)) return url
  }
  return null
}

function galleryCoverUrl(field: DataField | undefined, value: unknown) {
  if (field?.type === 'ATTACHMENT') return attachmentUrl(value)
  if (field?.type === 'LINK') return safeHttpUrl(value)
  return null
}

function titleHue(title: string) {
  let hash = 0
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}

function computedErrorText(error: ComputedFieldError) {
  if (error.code === 'DIV_ZERO') return '#DIV/0!'
  if (error.code === 'CYCLE') return '#CYCLE!'
  return `⚠ ${error.message || '计算错误'}`
}

function valueText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return '无法显示'
  }
}

function PlainValue({ field, value }: { field: DataField; value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="gallery-card__empty">未填写</span>
  if (field.type === 'CHECKBOX') return <span>{value ? '是' : '否'}</span>
  if (field.type === 'DATETIME' || field.type === 'CREATED_AT' || field.type === 'UPDATED_AT') {
    const date = typeof value === 'string' ? new Date(value) : null
    return <span>{date && !Number.isNaN(date.getTime()) ? date.toLocaleString('zh-CN') : valueText(value)}</span>
  }
  if (Array.isArray(value)) {
    return (
      <span className="gallery-card__tags">
        {value.map((item, index) => {
          const text = valueText(item)
          return <span key={`${text}:${index}`}>{text}</span>
        })}
      </span>
    )
  }
  if (typeof value === 'object') return <span>{JSON.stringify(value)}</span>
  return <span>{valueText(value)}</span>
}

export function GalleryCard({
  record,
  title,
  coverField,
  visibleFields,
  config,
  onOpen,
}: {
  record: BaseRecord
  title: string
  coverField?: DataField
  visibleFields: DataField[]
  config: GalleryViewConfig
  onOpen: () => void
}) {
  const [coverFailed, setCoverFailed] = useState(false)
  const coverUrl = coverFailed ? null : galleryCoverUrl(coverField, coverField ? record.values[coverField.key] : undefined)
  const size = config.cardSize ?? 'STANDARD'

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpen()
  }

  return (
    <div
      className={`gallery-card gallery-card--${size.toLowerCase()}`}
      data-testid={`gallery-card-${record.id}`}
      role="button"
      tabIndex={0}
      aria-label={`打开记录：${title}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="gallery-card__cover">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={`${title}封面`}
            loading="lazy"
            style={{ objectFit: (config.coverFit ?? 'COVER').toLowerCase() as CSSProperties['objectFit'] }}
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div
            className="gallery-card__placeholder"
            data-testid={`gallery-placeholder-${record.id}`}
            style={{ '--gallery-hue': titleHue(title) } as CSSProperties}
            aria-hidden="true"
          >
            <span>{title.slice(0, 1) || '记'}</span>
          </div>
        )}
      </div>
      <div className="gallery-card__body">
        <h3>{title}</h3>
        <dl>
          {visibleFields.map((field) => {
            const error = record.computedErrors?.[field.key]
            return (
              <div key={field.id} data-testid="gallery-field">
                <dt>{field.name}</dt>
                <dd className={field.type === 'LONG_TEXT' ? 'gallery-card__long-text' : undefined}>
                  {error ? (
                    <span className="gallery-card__computed-error" title={error.message}>{computedErrorText(error)}</span>
                  ) : (
                    <PlainValue field={field} value={record.values[field.key]} />
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
    </div>
  )
}
