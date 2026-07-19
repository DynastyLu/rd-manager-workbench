import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GalleryView } from '../components/GalleryView'
import type { BaseRecord, DataField, GalleryViewConfig } from '../types'

const fields: DataField[] = [
  { id: 'title-id', tableId: 'table-1', key: 'title', name: '事项', type: 'TEXT', config: {}, isPrimary: true, isRequired: true, sequence: 0, createdAt: '', updatedAt: '' },
  { id: 'cover-id', tableId: 'table-1', key: 'cover', name: '封面', type: 'ATTACHMENT', config: {}, isPrimary: false, isRequired: false, sequence: 1, createdAt: '', updatedAt: '' },
  { id: 'link-id', tableId: 'table-1', key: 'imageLink', name: '图片链接', type: 'LINK', config: {}, isPrimary: false, isRequired: false, sequence: 2, createdAt: '', updatedAt: '' },
  { id: 'tags-id', tableId: 'table-1', key: 'tags', name: '标签', type: 'MULTI_SELECT', config: {}, isPrimary: false, isRequired: false, sequence: 3, createdAt: '', updatedAt: '' },
  { id: 'score-id', tableId: 'table-1', key: 'score', name: '分数', type: 'NUMBER', config: {}, isPrimary: false, isRequired: false, sequence: 4, createdAt: '', updatedAt: '' },
  { id: 'formula-id', tableId: 'table-1', key: 'formula', name: '计算结果', type: 'FORMULA', config: {}, isPrimary: false, isRequired: false, sequence: 5, createdAt: '', updatedAt: '' },
  ...Array.from({ length: 5 }, (_, index): DataField => ({
    id: `extra-${index}`,
    tableId: 'table-1',
    key: `extra${index}`,
    name: `附加${index}`,
    type: 'LONG_TEXT',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 6 + index,
    createdAt: '',
    updatedAt: '',
  })),
]

const records: BaseRecord[] = [
  {
    id: 'record-1',
    values: {
      title: '候选人复试',
      cover: ['not-an-image.pdf', 'https://img.example.com/interview.png'],
      imageLink: 'https://img.example.com/link.png',
      tags: ['招聘', '高优先级'],
      score: 92,
      formula: null,
      extra0: '这是一段需要在画册卡片中截断的很长说明文字',
      extra1: 'A', extra2: 'B', extra3: 'C', extra4: 'D',
    },
    computedErrors: { formula: { code: 'DIV_ZERO', message: '除数不能为零' } },
    sourceType: null,
    sourceId: null,
    sourcePath: null,
    createdAt: '',
    updatedAt: '',
  },
]

const config: GalleryViewConfig = {
  titleFieldKey: 'missing-title',
  coverFieldKey: 'cover',
  visibleFieldIds: ['tags-id', 'score-id', 'formula-id', 'extra-0', 'extra-1', 'extra-2', 'extra-3', 'extra-4', 'link-id'],
  cardSize: 'STANDARD',
  coverFit: 'CONTAIN',
}

function renderGallery(overrides: Partial<React.ComponentProps<typeof GalleryView>> = {}) {
  return render(
    <GalleryView
      fields={fields}
      records={records}
      config={config}
      onOpenRecord={vi.fn()}
      {...overrides}
    />,
  )
}

describe('GalleryView', () => {
  it('falls back to the primary field and renders the first displayable attachment cover', () => {
    renderGallery()

    expect(screen.getByRole('heading', { name: '候选人复试' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '候选人复试封面' })).toHaveAttribute(
      'src',
      'https://img.example.com/interview.png',
    )
  })

  it('accepts an http link cover and rejects unsafe protocols', () => {
    const { rerender } = renderGallery({ config: { ...config, coverFieldKey: 'imageLink' } })
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://img.example.com/link.png')

    rerender(
      <GalleryView
        fields={fields}
        records={[{ ...records[0]!, values: { ...records[0]!.values, imageLink: 'javascript:alert(1)' } }]}
        config={{ ...config, coverFieldKey: 'imageLink' }}
        onOpenRecord={vi.fn()}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('gallery-placeholder-record-1')).toBeInTheDocument()
  })

  it('replaces a broken image with the stable title-based gradient placeholder', () => {
    renderGallery()
    fireEvent.error(screen.getByRole('img'))

    const placeholder = screen.getByTestId('gallery-placeholder-record-1')
    expect(placeholder).toBeInTheDocument()
    expect(placeholder.getAttribute('style')).toContain('--gallery-hue:')
  })

  it('limits additional fields to eight and renders typed values and computed errors', () => {
    renderGallery()
    const card = screen.getByTestId('gallery-card-record-1')

    expect(within(card).getByText('招聘')).toBeInTheDocument()
    expect(within(card).getByText('高优先级')).toBeInTheDocument()
    expect(within(card).getByText('92')).toBeInTheDocument()
    expect(within(card).getByText('#DIV/0!')).toHaveAttribute('title', '除数不能为零')
    expect(within(card).getAllByTestId('gallery-field')).toHaveLength(8)
    expect(within(card).queryByText('图片链接')).not.toBeInTheDocument()
  })

  it.each(['COMPACT', 'STANDARD', 'WIDE'] as const)('renders %s card size and cover fit', (cardSize) => {
    renderGallery({ config: { ...config, cardSize, coverFit: 'COVER' } })

    expect(screen.getByTestId('gallery-card-record-1')).toHaveClass(`gallery-card--${cardSize.toLowerCase()}`)
    expect(screen.getByRole('img')).toHaveStyle({ objectFit: 'cover' })
  })

  it('opens the original record from the card without exposing inline editors', async () => {
    const onOpenRecord = vi.fn()
    const user = userEvent.setup()
    renderGallery({ onOpenRecord })

    await user.click(screen.getByTestId('gallery-card-record-1'))

    expect(onOpenRecord).toHaveBeenCalledWith(records[0])
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
