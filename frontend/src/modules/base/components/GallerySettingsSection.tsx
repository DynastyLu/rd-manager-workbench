import type { DataField, GalleryViewConfig } from '../types'

const VISIBLE_FIELD_LIMIT = 8

export function GallerySettingsSection({
  fields,
  config,
  onChange,
}: {
  fields: DataField[]
  config: GalleryViewConfig
  onChange: (config: GalleryViewConfig) => void
}) {
  const coverFields = fields.filter((field) => field.type === 'ATTACHMENT' || field.type === 'LINK')
  const visibleIds = [...new Set(config.visibleFieldIds ?? [])].filter((id) =>
    fields.some((field) => field.id === id))
  const atLimit = visibleIds.length >= VISIBLE_FIELD_LIMIT

  return (
    <section className="view-settings__section" aria-labelledby="gallery-settings-heading">
      <div className="view-settings__section-heading">
        <div>
          <h3 id="gallery-settings-heading">画册设置</h3>
          <p>配置卡片标题、封面和摘要字段</p>
        </div>
      </div>
      <label className="view-settings__stacked-field">
        <span>标题字段</span>
        <select
          aria-label="画册标题字段"
          value={config.titleFieldKey ?? ''}
          onChange={(event) => onChange({ ...config, titleFieldKey: event.target.value || undefined })}
        >
          <option value="">主字段</option>
          {fields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select>
      </label>
      <label className="view-settings__stacked-field">
        <span>封面字段</span>
        <select
          aria-label="画册封面字段"
          value={config.coverFieldKey ?? ''}
          onChange={(event) => onChange({ ...config, coverFieldKey: event.target.value || undefined })}
        >
          <option value="">无封面</option>
          {coverFields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select>
      </label>
      <div className="view-settings__inline-fields">
        <label className="view-settings__stacked-field">
          <span>卡片尺寸</span>
          <select
            aria-label="画册卡片尺寸"
            value={config.cardSize ?? 'STANDARD'}
            onChange={(event) => onChange({ ...config, cardSize: event.target.value as GalleryViewConfig['cardSize'] })}
          >
            <option value="COMPACT">紧凑</option>
            <option value="STANDARD">标准</option>
            <option value="WIDE">宽版</option>
          </select>
        </label>
        <label className="view-settings__stacked-field">
          <span>封面适应</span>
          <select
            aria-label="画册封面适应"
            value={config.coverFit ?? 'COVER'}
            onChange={(event) => onChange({ ...config, coverFit: event.target.value as GalleryViewConfig['coverFit'] })}
          >
            <option value="COVER">铺满裁切</option>
            <option value="CONTAIN">完整显示</option>
          </select>
        </label>
      </div>
      <fieldset className="view-settings__gallery-fields">
        <legend>卡片字段 <span>{visibleIds.length}/{VISIBLE_FIELD_LIMIT}</span></legend>
        {fields.map((field) => {
          const checked = visibleIds.includes(field.id)
          return (
            <label key={field.id}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && atLimit}
                onChange={(event) => {
                  const nextIds = event.target.checked
                    ? [...visibleIds, field.id].slice(0, VISIBLE_FIELD_LIMIT)
                    : visibleIds.filter((id) => id !== field.id)
                  onChange({ ...config, visibleFieldIds: nextIds })
                }}
              />
              <span>{field.name}</span>
            </label>
          )
        })}
      </fieldset>
    </section>
  )
}
