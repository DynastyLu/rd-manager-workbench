import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GallerySettingsSection } from '../components/GallerySettingsSection'
import type { DataField, GalleryViewConfig } from '../types'

const fields: DataField[] = [
  { id: 'title-id', tableId: 'table', key: 'title', name: '事项', type: 'TEXT', config: {}, isPrimary: true, isRequired: true, sequence: 0, createdAt: '', updatedAt: '' },
  { id: 'cover-id', tableId: 'table', key: 'cover', name: '附件封面', type: 'ATTACHMENT', config: {}, isPrimary: false, isRequired: false, sequence: 1, createdAt: '', updatedAt: '' },
  { id: 'link-id', tableId: 'table', key: 'link', name: '链接封面', type: 'LINK', config: {}, isPrimary: false, isRequired: false, sequence: 2, createdAt: '', updatedAt: '' },
  { id: 'date-id', tableId: 'table', key: 'date', name: '日期', type: 'DATETIME', config: {}, isPrimary: false, isRequired: false, sequence: 3, createdAt: '', updatedAt: '' },
]

describe('GallerySettingsSection', () => {
  it('updates all gallery-specific settings and only offers valid cover fields', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const config: GalleryViewConfig = { cardSize: 'STANDARD', coverFit: 'COVER', visibleFieldIds: [] }
    render(<GallerySettingsSection fields={fields} config={config} onChange={onChange} />)

    expect(screen.getByRole('option', { name: '日期' })).toBeInTheDocument()
    expect(screen.getByLabelText('画册封面字段')).not.toContainHTML('日期')

    await user.selectOptions(screen.getByLabelText('画册标题字段'), 'title')
    await user.selectOptions(screen.getByLabelText('画册封面字段'), 'cover')
    await user.selectOptions(screen.getByLabelText('画册卡片尺寸'), 'WIDE')
    await user.selectOptions(screen.getByLabelText('画册封面适应'), 'CONTAIN')
    await user.click(screen.getByRole('checkbox', { name: '日期' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ titleFieldKey: 'title' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ coverFieldKey: 'cover' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cardSize: 'WIDE' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ coverFit: 'CONTAIN' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visibleFieldIds: ['date-id'] }))
  })

  it('disables unchecked fields after eight visible fields are selected', () => {
    const manyFields = Array.from({ length: 9 }, (_, index): DataField => ({
      id: `field-${index}`,
      tableId: 'table',
      key: `field${index}`,
      name: `字段${index}`,
      type: 'TEXT',
      config: {},
      isPrimary: index === 0,
      isRequired: false,
      sequence: index,
      createdAt: '',
      updatedAt: '',
    }))
    render(
      <GallerySettingsSection
        fields={manyFields}
        config={{ visibleFieldIds: manyFields.slice(0, 8).map((field) => field.id) }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: '字段8' })).toBeDisabled()
    expect(screen.getByText('8/8')).toBeInTheDocument()
  })
})
