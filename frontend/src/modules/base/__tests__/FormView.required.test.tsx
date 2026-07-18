import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FormView } from '../components/FormView'
import type { DataField } from '../types'

const field = (input: Partial<DataField> & Pick<DataField, 'id' | 'key' | 'name' | 'type'>): DataField => ({
  tableId: 'table-1',
  config: {},
  isPrimary: false,
  isRequired: false,
  sequence: 0,
  createdAt: '',
  updatedAt: '',
  ...input,
})

describe('FormView required fields', () => {
  it('marks and validates every required field before submitting', async () => {
    const onCreateRecord = vi.fn()
    const fields: DataField[] = [
      field({ id: 'title', key: 'title', name: '标题', type: 'TEXT', isPrimary: true, isRequired: true }),
      field({ id: 'status', key: 'status', name: '状态', type: 'SINGLE_SELECT', isRequired: true, config: { options: [{ label: '待处理', value: 'TODO' }] } }),
      field({ id: 'tags', key: 'tags', name: '标签', type: 'MULTI_SELECT', isRequired: true, config: { options: [{ label: '研发', value: 'RD' }] } }),
    ]
    const user = userEvent.setup()

    render(<FormView tableSource="CUSTOM" fields={fields} onCreateRecord={onCreateRecord} />)

    expect(screen.getByLabelText('状态')).toBeRequired()
    expect(screen.getByLabelText('标签')).toBeRequired()
    await user.type(screen.getByLabelText('标题'), '验收记录')
    await user.click(screen.getByRole('button', { name: '提交记录' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('状态、标签')
    expect(onCreateRecord).not.toHaveBeenCalled()
  })
})
