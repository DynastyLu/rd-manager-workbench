import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WorkbenchSettings from '../WorkbenchSettings'

describe('WorkbenchSettings', () => {
  it('describes local preferences without exposing account management', () => {
    render(<WorkbenchSettings />)

    expect(screen.getByRole('heading', { name: '工作台设置' })).toBeInTheDocument()
    expect(screen.getByText('本地偏好设置将在后续版本接入。')).toBeInTheDocument()
    expect(screen.queryByText(/登录|账户|权限/)).not.toBeInTheDocument()
  })
})
