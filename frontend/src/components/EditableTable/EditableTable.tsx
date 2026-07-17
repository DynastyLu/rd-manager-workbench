import type { TableData } from '@/types/ocr'

const LOW_CONFIDENCE_THRESHOLD = 0.6

interface EditableTableProps {
  data: TableData
  onChange: (data: TableData) => void
}

export default function EditableTable({ data, onChange }: EditableTableProps) {
  const { rows, cell_confidence } = data

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    const newRows = rows.map((row, r) =>
      r === rowIdx ? row.map((cell, c) => (c === colIdx ? value : cell)) : row
    )
    onChange({ ...data, rows: newRows })
  }

  const addRow = () =>
    onChange({
      ...data,
      rows: [...rows, Array(rows[0]?.length ?? 1).fill('') as string[]],
      cell_confidence: [
        ...(cell_confidence || []),
        Array(rows[0]?.length ?? 1).fill(1) as number[],
      ],
    })

  const addCol = () =>
    onChange({
      ...data,
      rows: rows.map((row) => [...row, '']),
      cell_confidence: (cell_confidence || []).map((row) => [...row, 1]),
    })

  const deleteRow = (idx: number) =>
    onChange({
      ...data,
      rows: rows.filter((_, i) => i !== idx),
      cell_confidence: (cell_confidence || []).filter((_, i) => i !== idx),
    })

  const deleteCol = (idx: number) =>
    onChange({
      ...data,
      rows: rows.map((row) => row.filter((_, i) => i !== idx)),
      cell_confidence: (cell_confidence || []).map((row) => row.filter((_, i) => i !== idx)),
    })

  if (!rows.length) return null

  const isLowConfidence = (rowIdx: number, colIdx: number) => {
    const conf = cell_confidence?.[rowIdx]?.[colIdx]
    return conf !== undefined && conf < LOW_CONFIDENCE_THRESHOLD
  }

  return (
    <div className="editable-table">
      <div className="editable-table__actions">
        <button onClick={addRow} className="editable-table__button">
          + 添加行
        </button>
        <button onClick={addCol} className="editable-table__button">
          + 添加列
        </button>
      </div>
      {cell_confidence && (
        <p className="editable-table__hint">⚠ 黄色背景单元格识别置信度较低，请重点核查</p>
      )}
      <table className="editable-table__table">
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  className={`editable-table__cell ${
                    isLowConfidence(rowIdx, colIdx) ? 'editable-table__cell--low bg-yellow-50' : ''
                  }`}
                >
                  <input
                    value={cell}
                    onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                    className="editable-table__input"
                  />
                </td>
              ))}
              <td className="pl-2">
                <button
                  onClick={() => deleteRow(rowIdx)}
                  className="editable-table__button editable-table__button--danger"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="editable-table__column-actions">
        {rows[0]?.map((_, colIdx) => (
          <button
            key={colIdx}
            onClick={() => deleteCol(colIdx)}
            className="editable-table__button editable-table__button--danger"
          >
            删列{colIdx + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
