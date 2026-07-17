import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  ExcelExportBatchPayload,
  ExcelExportPayload,
  MergedCellPayload,
} from '../../../shared/contracts/jobs/job-contracts';

@Injectable()
export class ExcelExportService {
  async generateExcel(input: ExcelExportPayload): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');

    input.rows.forEach((row) => sheet.addRow(row));
    this.applyMergedCells(sheet, input.mergedCells);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateExcelMultiSheet(input: ExcelExportBatchPayload): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const nameCount = new Map<string, number>();

    for (const { name = 'Sheet', rows, mergedCells = [] } of input.sheets) {
      let sheetName = this.sanitizeSheetName(name);
      const currentCount = nameCount.get(sheetName) ?? 0;

      if (currentCount > 0) {
        const suffix = `_${currentCount + 1}`;
        sheetName = `${sheetName.slice(0, 31 - suffix.length)}${suffix}`;
      }
      nameCount.set(this.sanitizeSheetName(name), currentCount + 1);

      const sheet = workbook.addWorksheet(sheetName);
      rows.forEach((row) => sheet.addRow(row));
      this.applyMergedCells(sheet, mergedCells);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private applyMergedCells(sheet: ExcelJS.Worksheet, mergedCells: MergedCellPayload[]) {
    mergedCells.forEach(({ startRow, startCol, endRow, endCol }) => {
      sheet.mergeCells(startRow + 1, startCol + 1, endRow + 1, endCol + 1);
    });
  }

  private sanitizeSheetName(name: string) {
    return String(name).replace(/[/\\?*[\]:]/g, '').slice(0, 31) || 'Sheet';
  }
}
