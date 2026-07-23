import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SaveStatus } from '../SaveStatus'

describe('SaveStatus', () => {
  it('announces saving, unsaved, saved and failed states', () => {
    const { rerender } = render(<SaveStatus state="saving" />)
    expect(screen.getByRole('status')).toHaveTextContent('正在保存')

    rerender(<SaveStatus state="dirty" />)
    expect(screen.getByRole('status')).toHaveTextContent('等待自动保存')

    rerender(<SaveStatus state="saved" />)
    expect(screen.getByRole('status')).toHaveTextContent('已保存')

    rerender(<SaveStatus state="error" message="保存失败，请重试" />)
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试')
  })
})
