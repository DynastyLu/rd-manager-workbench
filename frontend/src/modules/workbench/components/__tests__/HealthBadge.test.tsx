import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HealthBadge } from '../HealthBadge'

describe('HealthBadge', () => {
  it.each([
    ['GREEN', '正常', 'health-badge--green'],
    ['YELLOW', '关注', 'health-badge--yellow'],
    ['RED', '风险', 'health-badge--red'],
  ] as const)(
    'renders %s as Chinese text with a semantic state class',
    (health, label, className) => {
      render(<HealthBadge health={health} />)

      expect(screen.getByText(label).closest('.semi-tag')).toHaveClass(className)
    }
  )
})
