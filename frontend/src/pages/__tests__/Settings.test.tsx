import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WorkbenchSettings from '../WorkbenchSettings'

describe('WorkbenchSettings', () => {
  it('describes local preferences without exposing account management', () => {
    render(<WorkbenchSettings />)

    expect(screen.getByRole('heading', { name: '工作台设置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '通知送达范围' })).toBeInTheDocument()
    expect(screen.getByText(/应用完全退出后不保证提醒送达/)).toBeInTheDocument()
    expect(screen.getByText('短信通道未配置，不会发送短信')).toBeInTheDocument()
    expect(screen.getByText(/本机 PostgreSQL/)).toBeInTheDocument()
    expect(screen.queryByText(/登录|账户|权限/)).not.toBeInTheDocument()
  })
})
