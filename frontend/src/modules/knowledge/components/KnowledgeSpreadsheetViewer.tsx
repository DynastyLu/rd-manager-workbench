import { useEffect, useMemo, useState } from 'react'
import { Button, Spin } from '@douyinfe/semi-ui'
import { IconChevronLeft, IconChevronRight, IconFile } from '@douyinfe/semi-icons'
import {
  getKnowledgeWorkbook,
  type WorkbookPreview,
  type WorkbookPreviewMerge,
} from '../api'

const PAGE_SIZE = 100

function columnName(column: number): string {
  let value = column + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

function findMerge(
  merges: WorkbookPreviewMerge[],
  row: number,
  column: number,
): { merge: WorkbookPreviewMerge; origin: boolean } | null {
  const merge = merges.find((item) =>
    row >= item.startRow
    && row <= item.endRow
    && column >= item.startColumn
    && column <= item.endColumn,
  )
  if (!merge) return null
  return {
    merge,
    origin: row === merge.startRow && column === merge.startColumn,
  }
}

export function KnowledgeSpreadsheetViewer({
  documentId,
  fileName,
}: {
  documentId: string
  fileName: string
}) {
  const [result, setResult] = useState<{
    documentId: string
    workbook: WorkbookPreview | null
    error: string | null
  }>({ documentId: '', workbook: null, error: null })
  const [activeSheet, setActiveSheet] = useState(0)
  const [page, setPage] = useState(0)
  const [selectedCell, setSelectedCell] = useState<{
    sheetIndex: number
    address: string
    value: string
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getKnowledgeWorkbook(documentId)
      .then((workbook) => {
        if (!controller.signal.aborted) {
          setResult({ documentId, workbook, error: null })
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            documentId,
            workbook: null,
            error: error instanceof Error ? error.message : '工作簿读取失败',
          })
        }
      })
    return () => controller.abort()
  }, [documentId])

  const activeResult = result.documentId === documentId ? result : null
  const sheet = activeResult?.workbook?.sheets[activeSheet]
  const totalPages = Math.max(1, Math.ceil((sheet?.rowCount ?? 0) / PAGE_SIZE))
  const visibleRows = useMemo(() => {
    if (!sheet) return []
    const start = page * PAGE_SIZE
    return sheet.rows.slice(start, start + PAGE_SIZE).map((row, index) => ({
      row,
      absoluteRow: start + index,
    }))
  }, [page, sheet])

  if (activeResult?.error) {
    return (
      <div className="knowledge-file-viewer__fallback">
        <IconFile />
        <strong>无法读取工作簿</strong>
        <span>{activeResult.error}</span>
        <span>原文件仍可下载或用本机 Excel 打开。</span>
      </div>
    )
  }

  if (!activeResult?.workbook) {
    return <div className="knowledge-file-viewer__loading"><Spin /> 正在读取工作簿全部内容…</div>
  }

  if (!sheet) {
    return <div className="knowledge-file-viewer__fallback">工作簿中没有可显示的工作表。</div>
  }

  return (
    <section className="knowledge-spreadsheet" aria-label="Excel 工作簿预览">
      <header className="knowledge-spreadsheet__header">
        <div>
          <strong>{fileName}</strong>
          <span>{activeResult.workbook.sheets.length} 个工作表</span>
          <span>{sheet.rowCount} 行 × {sheet.columnCount} 列</span>
        </div>
        {totalPages > 1 ? (
          <div className="knowledge-spreadsheet__pagination">
            <Button
              icon={<IconChevronLeft />}
              aria-label="上一页数据"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            />
            <span>第 {page + 1} / {totalPages} 页</span>
            <Button
              icon={<IconChevronRight />}
              aria-label="下一页数据"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            />
          </div>
        ) : null}
      </header>

      <div className="knowledge-spreadsheet__formula-bar" aria-label="单元格完整内容">
        <span>{selectedCell?.sheetIndex === activeSheet ? selectedCell.address : 'fx'}</span>
        <div>
          {selectedCell?.sheetIndex === activeSheet
            ? selectedCell.value || '（空单元格）'
            : '选择单元格可在这里查看完整内容'}
        </div>
      </div>

      <div className="knowledge-spreadsheet__viewport">
        <table>
          <colgroup>
            <col className="knowledge-spreadsheet__row-number-column" />
            {Array.from({ length: sheet.columnCount }, (_, column) => (
              <col
                key={column}
                style={{ width: `${Math.max(72, (sheet.columnWidths[column] ?? 12) * 8)}px` }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="knowledge-spreadsheet__corner" />
              {Array.from({ length: sheet.columnCount }, (_, column) => (
                <th key={column} scope="col">{columnName(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, absoluteRow }) => (
              <tr
                key={absoluteRow}
                style={{ height: `${sheet.rowHeights[absoluteRow] ?? 30}px` }}
              >
                <th scope="row">{absoluteRow + 1}</th>
                {Array.from({ length: sheet.columnCount }, (_, column) => {
                  const merged = findMerge(sheet.merges, absoluteRow, column)
                  if (merged && !merged.origin) return null
                  const value = row[column] ?? ''
                  return (
                    <td
                      key={column}
                      colSpan={merged ? merged.merge.endColumn - merged.merge.startColumn + 1 : undefined}
                      rowSpan={merged ? merged.merge.endRow - merged.merge.startRow + 1 : undefined}
                      title={value}
                    >
                      <button
                        type="button"
                        className="knowledge-spreadsheet__cell"
                        aria-label={`${columnName(column)}${absoluteRow + 1}：${value || '空单元格'}`}
                        onClick={() => setSelectedCell({
                          sheetIndex: activeSheet,
                          address: `${columnName(column)}${absoluteRow + 1}`,
                          value,
                        })}
                      >
                        {value}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="knowledge-spreadsheet__tabs" role="tablist" aria-label="工作表">
        {activeResult.workbook.sheets.map((item, index) => (
          <button
            type="button"
            key={`${item.name}-${index}`}
            role="tab"
            aria-selected={activeSheet === index}
            onClick={() => {
              setActiveSheet(index)
              setPage(0)
            }}
          >
            {item.name}
          </button>
        ))}
      </nav>
    </section>
  )
}
