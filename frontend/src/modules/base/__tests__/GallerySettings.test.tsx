import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'

import { GallerySettingsSection } from '../components/GallerySettingsSection'
import { ViewSettingsDrawer } from '../components/ViewSettingsDrawer'
import type { DataField, DataView, GalleryViewConfig } from '../types'

const fields: DataField[] = [
  { id: 'title-id', tableId: 'table', key: 'title', name: '事项', type: 'TEXT', config: {}, isPrimary: true, isRequired: true, sequence: 0, createdAt: '', updatedAt: '' },
  { id: 'cover-id', tableId: 'table', key: 'cover', name: '附件封面', type: 'ATTACHMENT', config: {}, isPrimary: false, isRequired: false, sequence: 1, createdAt: '', updatedAt: '' },
  { id: 'link-id', tableId: 'table', key: 'link', name: '链接封面', type: 'LINK', config: {}, isPrimary: false, isRequired: false, sequence: 2, createdAt: '', updatedAt: '' },
  { id: 'date-id', tableId: 'table', key: 'date', name: '日期', type: 'DATETIME', config: {}, isPrimary: false, isRequired: false, sequence: 3, createdAt: '', updatedAt: '' },
]

describe('GallerySettingsSection', () => {
  it('is available inside the shared view settings drawer and uses its save flow', async () => {
    const onConfigChange = vi.fn()
    const view: DataView = {
      id: 'gallery-view',
      tableId: 'table',
      name: '候选人画册',
      type: 'GALLERY',
      config: { cardSize: 'STANDARD' },
      isDefault: false,
      sequence: 1,
      createdAt: '',
      updatedAt: '',
    }
    render(
      <ViewSettingsDrawer
        visible
        view={view}
        fields={fields}
        onClose={vi.fn()}
        onConfigChange={onConfigChange}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '画册设置' })).toBeInTheDocument()
    await selectSemiOption(screen.getByRole('combobox', { name: '卡片尺寸' }), 'WIDE')
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ cardSize: 'WIDE' }))
  })

  it('updates all gallery-specific settings and only offers valid cover fields', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const config: GalleryViewConfig = { cardSize: 'STANDARD', coverFit: 'COVER', visibleFieldIds: [] }
    render(<GallerySettingsSection fields={fields} config={config} onChange={onChange} />)

    await selectSemiOption(screen.getByLabelText('画册封面字段'), 'cover')
    await selectSemiOption(screen.getByLabelText('画册标题字段'), 'date')
    await selectSemiOption(screen.getByRole('combobox', { name: '卡片尺寸' }), 'WIDE')
    await selectSemiOption(screen.getByRole('combobox', { name: '封面适应' }), 'CONTAIN')
    await user.click(screen.getByRole('checkbox', { name: '日期' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ titleFieldKey: 'date' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ coverFieldKey: 'cover' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cardSize: 'WIDE' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ coverFit: 'CONTAIN' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visibleFieldIds: ['date-id'] }))
  })

  it('disables unchecked fields after eight visible fields are selected', () => {
    const manyFields = Array.from({ length: 10 }, (_, index): DataField => ({
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
        config={{ visibleFieldIds: manyFields.slice(1, 9).map((field) => field.id) }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: '字段9' })).toBeDisabled()
    expect(screen.getByText('8/8')).toBeInTheDocument()
  })

  it('does not count the selected title and cover as additional card fields', () => {
    render(
      <GallerySettingsSection
        fields={fields}
        config={{
          titleFieldKey: 'title',
          coverFieldKey: 'cover',
          visibleFieldIds: ['title-id', 'cover-id', 'date-id'],
        }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('checkbox', { name: '事项' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '附件封面' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '日期' })).toBeChecked()
    expect(screen.getByText('1/8')).toBeInTheDocument()
  })
})
