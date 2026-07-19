import { useMemo } from 'react'

import type { BaseRecord, DataField, GalleryViewConfig } from '../types'
import { GalleryCard } from './GalleryCard'
import './GalleryView.less'

function recordTitle(record: BaseRecord, titleField: DataField | undefined) {
  const value = titleField ? record.values[titleField.key] : undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const title = String(value).trim()
    if (title) return title
  }
  return '未命名记录'
}

export function GalleryView({
  fields,
  records,
  config,
  onOpenRecord,
}: {
  fields: DataField[]
  records: BaseRecord[]
  config: GalleryViewConfig
  onOpenRecord: (record: BaseRecord) => void
}) {
  const titleField = fields.find((field) => field.key === config.titleFieldKey)
    ?? fields.find((field) => field.isPrimary)
  const coverField = fields.find((field) =>
    field.key === config.coverFieldKey && (field.type === 'ATTACHMENT' || field.type === 'LINK'))
  const visibleFields = useMemo(() => {
    const ids = [...new Set(config.visibleFieldIds ?? [])]
    return ids
      .map((id) => fields.find((field) => field.id === id))
      .filter((field): field is DataField => Boolean(field))
      .filter((field) => field.id !== titleField?.id && field.id !== coverField?.id)
      .slice(0, 8)
  }, [config.visibleFieldIds, coverField?.id, fields, titleField?.id])

  if (!records.length) {
    return (
      <section className="gallery-view gallery-view--empty" aria-label="画册视图">
        <p>当前筛选条件下没有记录</p>
      </section>
    )
  }

  return (
    <section className={`gallery-view gallery-view--${(config.cardSize ?? 'STANDARD').toLowerCase()}`} aria-label="画册视图">
      {records.map((record) => {
        const title = recordTitle(record, titleField)
        return (
          <GalleryCard
            key={record.id}
            record={record}
            title={title}
            coverField={coverField}
            visibleFields={visibleFields}
            config={config}
            onOpen={() => onOpenRecord(record)}
          />
        )
      })}
    </section>
  )
}
