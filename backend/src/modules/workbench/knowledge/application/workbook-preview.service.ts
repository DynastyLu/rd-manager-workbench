import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface WorkbookPreviewMerge {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface WorkbookSheetPreview {
  name: string;
  rowCount: number;
  columnCount: number;
  rows: string[][];
  columnWidths: number[];
  rowHeights: number[];
  merges: WorkbookPreviewMerge[];
}

export interface WorkbookPreview {
  fileName: string;
  sheets: WorkbookSheetPreview[];
}

@Injectable()
export class WorkbookPreviewService {
  parse(input: { content: Buffer; fileName: string }): WorkbookPreview {
    try {
      const workbook = XLSX.read(input.content, {
        type: 'buffer',
        cellDates: true,
        cellFormula: true,
        cellNF: true,
        cellStyles: true,
      });

      return {
        fileName: input.fileName,
        sheets: workbook.SheetNames.map((name) => this.parseSheet(name, workbook.Sheets[name])),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown workbook error';
      throw new UnprocessableEntityException(`无法读取工作簿内容：${detail}`);
    }
  }

  private parseSheet(name: string, sheet: XLSX.WorkSheet | undefined): WorkbookSheetPreview {
    if (!sheet) {
      return {
        name,
        rowCount: 0,
        columnCount: 0,
        rows: [],
        columnWidths: [],
        rowHeights: [],
        merges: [],
      };
    }

    const contentCells = Object.keys(sheet)
      .filter((address) => !address.startsWith('!'))
      .map((address) => ({
        address,
        position: XLSX.utils.decode_cell(address),
        cell: sheet[address] as XLSX.CellObject,
      }))
      .filter(({ cell }) => cell.v !== undefined && cell.v !== null && cell.v !== '');

    if (contentCells.length === 0) {
      return {
        name,
        rowCount: 0,
        columnCount: 0,
        rows: [],
        columnWidths: [],
        rowHeights: [],
        merges: [],
      };
    }

    const maxRow = Math.max(...contentCells.map(({ position }) => position.r));
    const maxColumn = Math.max(...contentCells.map(({ position }) => position.c));
    const rowCount = maxRow + 1;
    const columnCount = maxColumn + 1;
    const rows = Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) =>
        this.displayValue(sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined),
      ),
    );

    const sheetColumns = sheet['!cols'] ?? [];
    const columnWidths = Array.from({ length: columnCount }, (_, column) => {
      const configured = sheetColumns[column]?.wch;
      if (typeof configured === 'number' && Number.isFinite(configured)) {
        return Math.min(60, Math.max(6, configured));
      }
      const longest = rows.reduce((length, row) => Math.max(length, this.visualLength(row[column] ?? '')), 0);
      return Math.min(48, Math.max(10, longest + 2));
    });

    const sheetRows = sheet['!rows'] ?? [];
    const rowHeights = Array.from({ length: rowCount }, (_, row) => {
      const configured = sheetRows[row]?.hpt;
      return typeof configured === 'number' && Number.isFinite(configured)
        ? Math.min(240, Math.max(22, configured))
        : 30;
    });

    const merges = (sheet['!merges'] ?? [])
      .filter((merge) => merge.s.r <= maxRow && merge.s.c <= maxColumn)
      .map((merge) => ({
        startRow: merge.s.r,
        startColumn: merge.s.c,
        endRow: Math.min(merge.e.r, maxRow),
        endColumn: Math.min(merge.e.c, maxColumn),
      }));

    return {
      name,
      rowCount,
      columnCount,
      rows,
      columnWidths,
      rowHeights,
      merges,
    };
  }

  private displayValue(cell: XLSX.CellObject | undefined): string {
    if (!cell) return '';
    if (cell.w !== undefined) return String(cell.w);
    if (cell.v instanceof Date) {
      return cell.v.toLocaleString('zh-CN', { hour12: false });
    }
    if (cell.v !== undefined && cell.v !== null) return String(cell.v);
    return cell.f ? `=${cell.f}` : '';
  }

  private visualLength(value: string): number {
    return Array.from(value).reduce(
      (length, character) => length + (character.charCodeAt(0) > 255 ? 2 : 1),
      0,
    );
  }
}
