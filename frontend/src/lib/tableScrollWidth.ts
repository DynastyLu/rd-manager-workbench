interface TableWidthColumn {
  width?: number | string
  children?: readonly TableWidthColumn[]
}

export type TableScrollWidth = number | 'max-content'

/**
 * Keeps Semi Table's horizontal canvas aligned with its currently rendered columns.
 * A missing/non-numeric leaf width falls back to the browser's intrinsic table width.
 */
export function tableScrollWidth(
  columns: readonly TableWidthColumn[],
  utilityColumnWidth = 0
): TableScrollWidth {
  let total = utilityColumnWidth

  const addLeafWidths = (items: readonly TableWidthColumn[]): boolean =>
    items.every((column) => {
      if (column.children?.length) {
        return addLeafWidths(column.children)
      }

      if (typeof column.width !== 'number' || !Number.isFinite(column.width)) {
        return false
      }

      total += column.width
      return true
    })

  return addLeafWidths(columns) ? total : 'max-content'
}
