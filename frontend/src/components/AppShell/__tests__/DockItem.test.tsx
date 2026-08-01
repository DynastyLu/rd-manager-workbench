import { fireEvent, render, screen } from '@testing-library/react'
import { motionValue } from 'framer-motion'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { NavigationItem } from '@/router/routes'
import { DockItem } from '../DockItem'

const projectItem: NavigationItem = {
  key: 'projects',
  title: '项目',
  icon: 'projects',
  path: '/spaces/projects',
}

function renderItem(active = false) {
  return render(
    <MemoryRouter initialEntries={[active ? projectItem.path : '/']}>
      <DockItem
        item={projectItem}
        active={active}
        mouseY={motionValue(Number.POSITIVE_INFINITY)}
      />
    </MemoryRouter>,
  )
}

describe('DockItem', () => {
  it('keeps real link semantics without a duplicate native tooltip', () => {
    renderItem(true)

    const link = screen.getByRole('link', { name: '项目' })
    expect(link).toHaveAttribute('href', '/spaces/projects')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).not.toHaveAttribute('title')
    expect(document.querySelector('.workspace-dock__dot')).toBeInTheDocument()
    expect(document.querySelector('.workspace-dock__tile')).toHaveAttribute('tabindex', '-1')
  })

  it('exposes one custom tooltip to pointer and keyboard users', () => {
    renderItem()

    const link = screen.getByRole('link', { name: '项目' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('项目')
    expect(link).toHaveAttribute('aria-describedby', tooltip.id)

    link.focus()
    fireEvent.focus(link)
    expect(link).toHaveFocus()
  })
})
