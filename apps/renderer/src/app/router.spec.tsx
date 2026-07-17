import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { App } from './App'

const NAVIGATION_LABELS = [
  '工作台',
  '项目与任务',
  '品种申报',
  '风险与决策',
  '合作方与会议',
  '行业情报',
  '报表与提醒',
  '设置',
]

function renderRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

describe('workbench router', () => {
  it('renders the local workbench without an authentication redirect', async () => {
    renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: '研发主管工作台' }),
    ).toBeVisible()
    expect(screen.queryByText('登录')).not.toBeInTheDocument()
  })

  it('offers exactly the eight approved navigation destinations', () => {
    renderRoute('/')

    const navigation = screen.getByRole('navigation', { name: '主导航' })
    expect(within(navigation).getAllByRole('link')).toHaveLength(8)
    for (const label of NAVIGATION_LABELS) {
      expect(within(navigation).getByRole('link', { name: label })).toBeVisible()
    }
  })

  it('labels all four dashboard modules as not connected', () => {
    renderRoute('/')

    for (const label of ['今日行动', '项目预警', '申报节点', '情报摘要']) {
      expect(screen.getByRole('heading', { name: label })).toBeVisible()
    }
    expect(screen.getAllByText('尚未接入')).toHaveLength(4)
  })

  it('does not define a login route', () => {
    renderRoute('/login')

    expect(screen.getByRole('heading', { name: '页面不存在' })).toBeVisible()
    expect(screen.queryByText('登录')).not.toBeInTheDocument()
  })
})
