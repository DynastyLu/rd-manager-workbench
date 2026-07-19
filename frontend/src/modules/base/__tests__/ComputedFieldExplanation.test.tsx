import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { computedFieldExplanation } from '../computedFieldExplanation'
import { ComputedFieldExplanation } from '../components/ComputedFieldExplanation'
import type { DataField, DataTable } from '../types'

const field = (id: string, name: string, type: DataField['type'], config = {}): DataField => ({
  id,
  tableId: 'candidates',
  key: id,
  name,
  type,
  config,
  isPrimary: false,
  isRequired: false,
  sequence: 0,
  createdAt: '',
  updatedAt: '',
})

const relation = field('relation', '岗位', 'RELATION', { targetTableId: 'positions' })
const title = field('title', '岗位名称', 'TEXT')
const score = field('score', '评分', 'NUMBER')
const targetTable: DataTable = {
  id: 'positions',
  workspaceId: 'workspace',
  name: '岗位',
  description: null,
  source: 'CUSTOM',
  icon: null,
  sequence: 0,
  fields: [title, score],
  views: [],
  createdAt: '',
  updatedAt: '',
}

describe('computedFieldExplanation', () => {
  it('describes LOOKUP, COUNT/SUM ROLLUP and FORMULA configurations precisely', () => {
    expect(
      computedFieldExplanation(
        field('lookup', '岗位名称引用', 'LOOKUP', {
          relationFieldId: relation.id,
          targetFieldId: title.id,
        }),
        [relation],
        [targetTable]
      )
    ).toBe('通过「岗位」引用「岗位名称」')
    expect(
      computedFieldExplanation(
        field('count', '岗位数', 'ROLLUP', { relationFieldId: relation.id, aggregation: 'COUNT' }),
        [relation],
        [targetTable]
      )
    ).toBe('通过「岗位」进行计数')
    expect(
      computedFieldExplanation(
        field('sum', '总评分', 'ROLLUP', {
          relationFieldId: relation.id,
          targetFieldId: score.id,
          aggregation: 'SUM',
        }),
        [relation],
        [targetTable]
      )
    ).toBe('通过「岗位」对「评分」进行求和')
    expect(
      computedFieldExplanation(
        field('formula', '评级', 'FORMULA', { expression: 'IF({score} > 90, "A", "B")' }),
        [relation],
        [targetTable]
      )
    ).toBe('公式：IF({score} > 90, "A", "B")')
  })

  it('uses readable incomplete fallbacks and exposes the full formula as a title', () => {
    expect(
      computedFieldExplanation(field('lookup', '坏引用', 'LOOKUP'), [relation], [targetTable])
    ).toBe('查找引用配置不完整')
    expect(
      computedFieldExplanation(field('rollup', '坏汇总', 'ROLLUP'), [relation], [targetTable])
    ).toBe('关联汇总配置不完整')
    expect(
      computedFieldExplanation(field('formula', '坏公式', 'FORMULA'), [relation], [targetTable])
    ).toBe('公式配置不完整')

    const formula = field('formula', '评级', 'FORMULA', { expression: '{score} * 2' })
    render(<ComputedFieldExplanation field={formula} fields={[relation]} tables={[targetTable]} />)
    expect(screen.getByTitle('{score} * 2')).toHaveTextContent('{score} * 2')
  })
})
