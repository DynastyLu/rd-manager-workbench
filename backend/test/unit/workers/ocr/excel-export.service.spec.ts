import { ExcelExportService } from '../../../../src/workers/ocr/services/excel-export.service';

describe('ExcelExportService', () => {
  it('generates a workbook buffer for one sheet', async () => {
    const service = new ExcelExportService();

    const buffer = await service.generateExcel({
      rows: [
        ['姓名', '金额'],
        ['张三', '100'],
      ],
      mergedCells: [],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('generates a workbook buffer for multiple sheets with duplicate names', async () => {
    const service = new ExcelExportService();

    const buffer = await service.generateExcelMultiSheet({
      sheets: [
        { name: 'Sheet/One', rows: [['A']], mergedCells: [] },
        { name: 'Sheet/One', rows: [['B']], mergedCells: [] },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
