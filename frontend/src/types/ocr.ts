/** [row, col] — 0-based, matches backend baiduService / excelService format */
export interface MergedCell {
  from: [number, number]
  to: [number, number]
}

export interface TableData {
  rows: string[][]
  cell_confidence?: number[][]
  merged_cells?: MergedCell[]
}

export type FileStatus = 'waiting' | 'processing' | 'done' | 'error'

export interface FileItem {
  id: string
  file: File
  name: string
  preview: string
  status: FileStatus
  tableData: TableData | null
  error: string | null
}
