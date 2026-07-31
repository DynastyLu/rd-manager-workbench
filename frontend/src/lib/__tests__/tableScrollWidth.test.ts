import { describe, expect, it } from 'vitest'
import { tableScrollWidth } from '../tableScrollWidth'

describe('tableScrollWidth', () => {
  it('uses the exact total width of the visible leaf columns', () => {
    expect(tableScrollWidth([{ width: 210 }, { width: 150 }, { width: 190 }])).toBe(550)
  })

  it('includes explicitly rendered utility columns such as row selection', () => {
    expect(tableScrollWidth([{ width: 190 }, { width: 150 }], 60)).toBe(400)
  })

  it('sums grouped leaf columns without also counting the group header', () => {
    expect(
      tableScrollWidth([
        {
          width: 999,
          children: [{ width: 120 }, { width: 180 }],
        },
        { width: 100 },
      ])
    ).toBe(400)
  })

  it('falls back to intrinsic table width when a leaf column has no numeric width', () => {
    expect(tableScrollWidth([{ width: 120 }, { title: '未指定宽度' }])).toBe('max-content')
  })
})
