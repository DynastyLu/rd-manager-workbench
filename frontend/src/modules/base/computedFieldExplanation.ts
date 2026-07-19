import type { DataField, DataTable } from './types'

const AGGREGATION_LABELS: Record<string, string> = {
  COUNT: '计数',
  SUM: '求和',
  AVG: '平均值',
  MIN: '最小值',
  MAX: '最大值',
}

function relationContext(field: DataField, fields: DataField[], tables: DataTable[]) {
  const relationFieldId =
    typeof field.config.relationFieldId === 'string' ? field.config.relationFieldId : ''
  const relation = fields.find((item) => item.id === relationFieldId && item.type === 'RELATION')
  const targetTableId =
    relation && typeof relation.config.targetTableId === 'string'
      ? relation.config.targetTableId
      : ''
  return { relation, targetTable: tables.find((table) => table.id === targetTableId) }
}

export function computedFieldExplanation(
  field: DataField,
  fields: DataField[],
  tables: DataTable[]
) {
  if (field.type === 'LOOKUP') {
    const { relation, targetTable } = relationContext(field, fields, tables)
    const targetFieldId =
      typeof field.config.targetFieldId === 'string' ? field.config.targetFieldId : ''
    const target = targetTable?.fields?.find((item) => item.id === targetFieldId)
    return relation && target
      ? `通过「${relation.name}」引用「${target.name}」`
      : '查找引用配置不完整'
  }
  if (field.type === 'ROLLUP') {
    const { relation, targetTable } = relationContext(field, fields, tables)
    const aggregation = typeof field.config.aggregation === 'string' ? field.config.aggregation : ''
    const aggregationLabel = AGGREGATION_LABELS[aggregation]
    if (!relation || !aggregationLabel) return '关联汇总配置不完整'
    if (aggregation === 'COUNT') return `通过「${relation.name}」进行${aggregationLabel}`
    const targetFieldId =
      typeof field.config.targetFieldId === 'string' ? field.config.targetFieldId : ''
    const target = targetTable?.fields?.find((item) => item.id === targetFieldId)
    return target
      ? `通过「${relation.name}」对「${target.name}」进行${aggregationLabel}`
      : '关联汇总配置不完整'
  }
  if (field.type === 'FORMULA') {
    const expression =
      typeof field.config.expression === 'string' ? field.config.expression.trim() : ''
    return expression ? `公式：${expression}` : '公式配置不完整'
  }
  return ''
}
