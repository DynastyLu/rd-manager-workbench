import type { DataField, DataTable } from '../types'
import { computedFieldExplanation } from '../computedFieldExplanation'

export function ComputedFieldExplanation({
  field,
  fields,
  tables,
}: {
  field: DataField
  fields: DataField[]
  tables: DataTable[]
}) {
  const explanation = computedFieldExplanation(field, fields, tables)
  const expression =
    field.type === 'FORMULA' && typeof field.config.expression === 'string'
      ? field.config.expression.trim()
      : ''
  if (expression) {
    return (
      <span>
        公式：<code title={expression}>{expression}</code>
      </span>
    )
  }
  return <span>{explanation}</span>
}
